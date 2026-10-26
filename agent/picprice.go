package main

// Módulo picprice: API HTTP local do RV Pic Price (só 127.0.0.1).
//
// Quem chama é um sistema no MESMO servidor (hoje o SyncCompras). O agente:
//   1. pede autorização à plataforma da RV (token RV Pic Price, status, cota),
//      autenticado pela chave do servidor, e confere a assinatura da resposta;
//   2. consulta a fonte de preços daqui, do servidor do cliente;
//   3. tira os itens falsos, junta repetidos, monta o ranking e reconhece a
//      própria loja.
//
// Regras de uso (condição da arquitetura): só sob demanda (cada chamada = um
// item que o usuário escolheu), só as lojas deste cliente, sem pré-carregamento,
// sem fila, uma consulta por vez e intervalo mínimo entre consultas.
//
// Contrato completo: agent/docs/api-local.md e agent/docs/openapi.yaml.

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	intervaloMinimoConsulta = 2 * time.Second  // entre duas consultas à fonte
	prazoConsulta           = 40 * time.Second // ranking inteiro (todas as lojas)
	validadeCacheFonte      = 10 * time.Minute // cache local curto
	raioPropriaLojaKm       = 0.2
	tamanhoRanking          = 10
)

var (
	fonteBase = "https://menorpreco.notaparana.pr.gov.br/api/v1"
	reGeohash = regexp.MustCompile(`^[0-9bcdefghjkmnpqrstuvwxyz]{5,12}$`)
	httpFonte = &http.Client{Timeout: 15 * time.Second}
)

// ── servidor HTTP ───────────────────────────────────────────────────────────

func iniciaAPILocal(cfg *Config) {
	addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(cfg.portaPicprice()))
	srv := &http.Server{
		Addr:              addr,
		Handler:           novaAPILocal(cfg),
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      70 * time.Second,
	}
	logf("API local do RV Pic Price em http://%s", addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logf("API local não subiu (%v) — a licença segue funcionando normalmente", err)
	}
}

type apiLocal struct {
	cfg        *Config
	consulta   sync.Mutex // uma consulta por vez
	ultimaVez  time.Time
	cacheMu    sync.Mutex
	cache      map[string]itemCache
	agora      func() time.Time
	dormir     func(context.Context, time.Duration) error
	modulos    func() Modulos
	autorizar  func(ctx context.Context, token string, p pedidoAutorizacao) (respAutorizacao, error)
	buscarFont func(ctx context.Context, url string) (*respostaFonte, error)
	repassar   func(ctx context.Context, metodo, caminho, token string, corpo []byte) ([]byte, int, error)
}

type itemCache struct {
	dados  *respostaFonte
	expira time.Time
}

func novaAPILocal(cfg *Config) http.Handler {
	a := &apiLocal{
		cfg:     cfg,
		cache:   map[string]itemCache{},
		agora:   time.Now,
		dormir:  dormirCtx,
		modulos: rt.obterModulos,
	}
	a.autorizar = a.autorizarNaRV
	a.buscarFont = buscarFonteReal
	a.repassar = a.repassarParaRV
	return a.rotas()
}

func (a *apiLocal) rotas() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/saude", a.saude)
	mux.HandleFunc("GET /v1/picprice/status", a.status)
	mux.HandleFunc("POST /v1/picprice/geohash", a.geohash)
	mux.HandleFunc("POST /v1/picprice/ranking", a.ranking)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		responder(w, http.StatusNotFound, map[string]any{"estado": "ROTA_INEXISTENTE", "mensagem": "Veja GET /v1/saude e a documentação da API local."})
	})
	return soLocal(mux)
}

// soLocal recusa qualquer conexão que não venha do próprio servidor.
func soLocal(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() {
			responder(w, http.StatusForbidden, map[string]any{"estado": "PROIBIDO", "mensagem": "A API local só aceita chamadas do próprio servidor."})
			return
		}
		h.ServeHTTP(w, r)
	})
}

func responder(w http.ResponseWriter, status int, corpo any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(corpo)
}

func tokenDe(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

// statusHTTP: o código HTTP de cada estado (o corpo traz sempre `estado`).
func statusHTTP(estado string) int {
	switch estado {
	case "OK":
		return http.StatusOK
	case "REQUISICAO_INVALIDA", "ENDERECO_NAO_ENCONTRADO":
		return http.StatusBadRequest
	case "TOKEN_INVALIDO", "TOKEN_EXPIRADO", "AGENTE_NAO_AUTENTICADO":
		return http.StatusUnauthorized
	case "MODULO_DESATIVADO":
		return http.StatusForbidden
	case "LIMITE_DIARIO", "LIMITE_EXCEDIDO":
		return http.StatusTooManyRequests
	case "INALCANCAVEL":
		return http.StatusBadGateway
	default: // MANUTENCAO, FONTE_INDISPONIVEL, ...
		return http.StatusServiceUnavailable
	}
}

func estadoMsg(estado, msg string) map[string]any {
	return map[string]any{"estado": estado, "mensagem": msg}
}

const msgInalcancavel = "Serviço inoperante/inalcançável"

// ── GET /v1/saude ───────────────────────────────────────────────────────────

func (a *apiLocal) saude(w http.ResponseWriter, _ *http.Request) {
	m := a.modulos()
	var contato any
	if t := rt.obterUltimoContato(); !t.IsZero() {
		contato = t.UTC().Format(time.RFC3339)
	}
	responder(w, http.StatusOK, map[string]any{
		"agente":          "rvland-agent",
		"versao":          versao,
		"servidorId":      a.cfg.ServidorID,
		"modulos":         map[string]bool{"licenca": m.Licenca, "picprice": m.Picprice},
		"ultimoContatoRV": contato,
		"apiLocal":        map[string]any{"porta": a.cfg.portaPicprice(), "versao": "v1"},
	})
}

// ── GET /v1/picprice/status (não conta na cota) ─────────────────────────────

func (a *apiLocal) status(w http.ResponseWriter, r *http.Request) {
	if !a.modulos().Picprice {
		responder(w, http.StatusForbidden, estadoMsg("MODULO_DESATIVADO", "Módulo RV Pic Price desligado neste servidor."))
		return
	}
	b, _, err := a.repassar(r.Context(), http.MethodGet, "/api/picprice/status", tokenDe(r), nil)
	a.devolverDaRV(w, b, err)
}

// ── POST /v1/picprice/geohash {endereco} (conta na cota) ───────────────────

func (a *apiLocal) geohash(w http.ResponseWriter, r *http.Request) {
	if !a.modulos().Picprice {
		responder(w, http.StatusForbidden, estadoMsg("MODULO_DESATIVADO", "Módulo RV Pic Price desligado neste servidor."))
		return
	}
	corpo, _ := io.ReadAll(io.LimitReader(r.Body, 64<<10))
	b, _, err := a.repassar(r.Context(), http.MethodPost, "/api/picprice/geohash", tokenDe(r), corpo)
	a.devolverDaRV(w, b, err)
}

func (a *apiLocal) devolverDaRV(w http.ResponseWriter, b []byte, err error) {
	if err != nil {
		responder(w, http.StatusBadGateway, estadoMsg("INALCANCAVEL", msgInalcancavel))
		return
	}
	var o map[string]any
	if json.Unmarshal(b, &o) != nil || o["estado"] == nil {
		responder(w, http.StatusBadGateway, estadoMsg("INALCANCAVEL", msgInalcancavel+" (resposta inesperada)"))
		return
	}
	responder(w, statusHTTP(fmt.Sprint(o["estado"])), o)
}

// repassarParaRV chama as rotas do RV Pic Price da plataforma com o token do cliente.
func (a *apiLocal) repassarParaRV(ctx context.Context, metodo, caminho, token string, corpo []byte) ([]byte, int, error) {
	var resp []byte
	var status int
	err := tentaEnderecos(a.cfg.Enderecos, func(base string) error {
		var rd io.Reader
		if corpo != nil {
			rd = strings.NewReader(string(corpo))
		}
		req, err := http.NewRequestWithContext(ctx, metodo, base+caminho, rd)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		if corpo != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		r, err := httpCli.Do(req)
		if err != nil {
			return err
		}
		defer r.Body.Close()
		resp, _ = io.ReadAll(io.LimitReader(r.Body, 1<<20))
		status = r.StatusCode
		if status >= 500 && !strings.HasPrefix(strings.TrimSpace(string(resp)), "{") {
			return fmt.Errorf("plataforma respondeu %d", status)
		}
		return nil
	})
	return resp, status, err
}

// ── POST /v1/picprice/ranking ───────────────────────────────────────────────

type lojaPedido struct {
	Codigo     string  `json:"codigo"`
	Geohash    string  `json:"geohash"`
	PrecoVenda float64 `json:"precoVenda"`
}

type pedidoRanking struct {
	Gtin  string       `json:"gtin"`
	Lojas []lojaPedido `json:"lojas"`
	Raio  *float64     `json:"raio"`
	Data  *int         `json:"data"`
}

type pedidoAutorizacao struct {
	Gtin  string   `json:"gtin"`
	Lojas []string `json:"lojas"`
	Raio  float64  `json:"raio"`
	Data  int      `json:"data"`
}

type respAutorizacao struct {
	Estado      string         `json:"estado"`
	Autorizacao *LeaseEnvelope `json:"autorizacao,omitempty"`
	Uso         any            `json:"uso,omitempty"`
	bruto       map[string]any
}

type payloadAutorizacao struct {
	V          int      `json:"v"`
	Tipo       string   `json:"tipo"`
	ServidorID string   `json:"servidor_id"`
	ClienteID  string   `json:"cliente_id"`
	Gtin       string   `json:"gtin"`
	Lojas      []string `json:"lojas"`
	Raio       float64  `json:"raio"`
	Data       int      `json:"data"`
	EmitidoEm  string   `json:"emitido_em"`
	ExpiraEm   string   `json:"expira_em"`
}

// normalizaPedido valida e normaliza (mesmas regras da plataforma).
func normalizaPedido(p pedidoRanking) (pedidoRanking, pedidoAutorizacao, error) {
	gtin := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, p.Gtin)
	for len(gtin) > 8 && strings.HasPrefix(gtin, "0") {
		gtin = gtin[1:]
	}
	if len(gtin) < 8 || len(gtin) > 14 {
		return p, pedidoAutorizacao{}, errors.New("gtin precisa ter de 8 a 14 dígitos")
	}
	if len(p.Lojas) == 0 || len(p.Lojas) > 30 {
		return p, pedidoAutorizacao{}, errors.New("informe de 1 a 30 lojas")
	}
	vistos := map[string]bool{}
	ghs := []string{}
	for i := range p.Lojas {
		p.Lojas[i].Codigo = strings.TrimSpace(p.Lojas[i].Codigo)
		p.Lojas[i].Geohash = strings.ToLower(strings.TrimSpace(p.Lojas[i].Geohash))
		if p.Lojas[i].Codigo == "" || !reGeohash.MatchString(p.Lojas[i].Geohash) {
			return p, pedidoAutorizacao{}, fmt.Errorf("loja %d: código e geohash válidos são obrigatórios", i+1)
		}
		if !vistos[p.Lojas[i].Geohash] {
			vistos[p.Lojas[i].Geohash] = true
			ghs = append(ghs, p.Lojas[i].Geohash)
		}
	}
	sort.Strings(ghs)
	raio := 3.0
	if p.Raio != nil && *p.Raio > 0 {
		raio = *p.Raio
	}
	raio = min(20, max(0.5, raio))
	data := -1
	if p.Data != nil {
		data = min(6, max(-1, *p.Data))
	}
	p.Gtin, p.Raio, p.Data = gtin, &raio, &data
	return p, pedidoAutorizacao{Gtin: gtin, Lojas: ghs, Raio: raio, Data: data}, nil
}

func (a *apiLocal) ranking(w http.ResponseWriter, r *http.Request) {
	if !a.modulos().Picprice {
		responder(w, http.StatusForbidden, estadoMsg("MODULO_DESATIVADO", "Módulo RV Pic Price desligado neste servidor."))
		return
	}
	var bruto pedidoRanking
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&bruto); err != nil {
		responder(w, http.StatusBadRequest, estadoMsg("REQUISICAO_INVALIDA", "JSON inválido."))
		return
	}
	ped, auth, err := normalizaPedido(bruto)
	if err != nil {
		responder(w, http.StatusBadRequest, estadoMsg("REQUISICAO_INVALIDA", err.Error()))
		return
	}
	token := tokenDe(r)
	if token == "" {
		responder(w, http.StatusUnauthorized, map[string]any{"estado": "TOKEN_INVALIDO", "motivo": "inexistente", "mensagem": "Serviço inválido - token inválido"})
		return
	}

	ctx, cancelar := context.WithTimeout(r.Context(), prazoConsulta+15*time.Second)
	defer cancelar()

	// uma consulta por vez, com intervalo mínimo entre elas
	a.consulta.Lock()
	defer a.consulta.Unlock()
	if espera := intervaloMinimoConsulta - a.agora().Sub(a.ultimaVez); espera > 0 {
		if err := a.dormir(ctx, espera); err != nil {
			responder(w, http.StatusServiceUnavailable, estadoMsg("FONTE_INDISPONIVEL", "Consulta cancelada."))
			return
		}
	}

	// 1) autorização da plataforma (conta na cota) + assinatura conferida aqui
	ra, err := a.autorizar(ctx, token, auth)
	if err != nil {
		responder(w, http.StatusBadGateway, estadoMsg("INALCANCAVEL", msgInalcancavel))
		return
	}
	if ra.Estado != "OK" {
		responder(w, statusHTTP(ra.Estado), ra.bruto)
		return
	}
	if err := a.confereAutorizacao(ra.Autorizacao, auth); err != nil {
		logf("picprice: autorização recusada: %v", err)
		responder(w, http.StatusBadGateway, estadoMsg("INALCANCAVEL", msgInalcancavel+" (autorização inválida)"))
		return
	}

	// 2) fonte, daqui, loja por loja
	a.ultimaVez = a.agora()
	ctxFonte, cancelaFonte := context.WithTimeout(ctx, prazoConsulta)
	defer cancelaFonte()
	lojas := []map[string]any{}
	semResposta := []string{}
	var motivo string
	for i, l := range ped.Lojas {
		if i > 0 {
			_ = a.dormir(ctxFonte, 300*time.Millisecond)
		}
		rl, err := a.rankingDaLoja(ctxFonte, ped.Gtin, l, *ped.Raio, *ped.Data)
		if err != nil {
			semResposta = append(semResposta, l.Codigo)
			motivo = err.Error()
			continue
		}
		lojas = append(lojas, rl)
	}
	a.ultimaVez = a.agora()
	if len(lojas) == 0 {
		responder(w, http.StatusServiceUnavailable, map[string]any{
			"estado":   "FONTE_INDISPONIVEL",
			"mensagem": "A fonte de preços não respondeu. Tente de novo em instantes.",
			"detalhe":  motivo,
			"uso":      ra.Uso,
		})
		return
	}
	responder(w, http.StatusOK, map[string]any{
		"estado":           "OK",
		"gtin":             ped.Gtin,
		"raio":             *ped.Raio,
		"data":             *ped.Data,
		"consultadoEm":     a.agora().UTC().Format(time.RFC3339),
		"lojas":            lojas,
		"lojasSemResposta": semResposta,
		"uso":              ra.Uso,
	})
}

// autorizarNaRV: POST assinado (chave do servidor) em /api/agente/picprice/autorizar.
func (a *apiLocal) autorizarNaRV(ctx context.Context, token string, p pedidoAutorizacao) (respAutorizacao, error) {
	corpo, _ := json.Marshal(map[string]any{"token": token, "gtin": p.Gtin, "lojas": p.Lojas, "raio": p.Raio, "data": p.Data})
	var out respAutorizacao
	err := tentaEnderecos(a.cfg.Enderecos, func(base string) error {
		ts := time.Now().UTC().Format(time.RFC3339)
		sig, err := assina(mensagemHeartbeat(ts, corpo), a.cfg.SeedB64)
		if err != nil {
			return err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/api/agente/picprice/autorizar", strings.NewReader(string(corpo)))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-RVLand-Servidor", a.cfg.ServidorID)
		req.Header.Set("X-RVLand-Timestamp", ts)
		req.Header.Set("X-RVLand-Assinatura", sig)
		r, err := httpCli.Do(req)
		if err != nil {
			return err
		}
		defer r.Body.Close()
		b, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		var bruto map[string]any
		if json.Unmarshal(b, &bruto) != nil || bruto["estado"] == nil {
			return fmt.Errorf("plataforma respondeu %d sem estado", r.StatusCode)
		}
		_ = json.Unmarshal(b, &out)
		out.bruto = bruto
		return nil
	})
	return out, err
}

// confereAutorizacao: assinatura (licensePK) + servidor, EAN, lojas, raio, data e validade.
func (a *apiLocal) confereAutorizacao(env *LeaseEnvelope, p pedidoAutorizacao) error {
	if env == nil {
		return errors.New("sem autorização")
	}
	payload, err := base64.StdEncoding.DecodeString(env.Payload)
	if err != nil {
		return errors.New("payload inválido")
	}
	if !verificaComPub(payload, env.Assinatura, licensePK) {
		return errors.New("assinatura não confere")
	}
	var pa payloadAutorizacao
	if err := json.Unmarshal(payload, &pa); err != nil {
		return err
	}
	exp, err := time.Parse(time.RFC3339, pa.ExpiraEm)
	switch {
	case pa.Tipo != "picprice_autorizacao":
		return errors.New("tipo errado")
	case pa.ServidorID != a.cfg.ServidorID:
		return errors.New("autorização de outro servidor")
	case pa.Gtin != p.Gtin:
		return errors.New("EAN diferente do pedido")
	case strings.Join(pa.Lojas, ",") != strings.Join(p.Lojas, ","):
		return errors.New("lojas diferentes do pedido")
	case pa.Raio != p.Raio || pa.Data != p.Data:
		return errors.New("raio/período diferentes do pedido")
	case err != nil || !a.agora().Before(exp):
		return errors.New("autorização vencida")
	}
	return nil
}

func dormirCtx(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
