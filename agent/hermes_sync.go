package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Modo Hermes do agente (P4): ciclo de licença do Hermes pelas rotas assinadas
// POST /api/agente/hermes (sync) e POST /api/agente/hermes/credencial. Contrato completo em
// docs/hermes-protocolo-agente.md. Nunca chama heartbeat, Pic Price nem comandos do Credit.

const (
	rotaSyncHermes       = "/api/agente/hermes"
	rotaCredencialHermes = "/api/agente/hermes/credencial"

	esperaPadraoHermes   = 60 * time.Second
	espera401Hermes      = 10 * time.Minute
	espera404Hermes      = 6 * time.Hour
	esperaCorpoHermes    = 5 * time.Minute
	espera429Hermes      = 60 * time.Minute
	reenvioDigestHermes  = time.Hour
	reenvioAgenteHermes  = time.Hour
	timeoutUpdateHermes  = 45 * time.Minute
	janelaServidorHermes = 5 * time.Minute // ±5 min do servidor (assinatura-agente.ts)
	maxRespostaHermes    = 1 << 20
	maxDadosEvento       = 2000
)

// mensagemHermes: `hermes:<rota>:<timestamp>.<sha256_hex(corpo)>` (lib/hermes/assinatura-agente.ts).
func mensagemHermes(rota, ts string, corpo []byte) []byte {
	return []byte("hermes:" + rota + ":" + ts + "." + sha256Hex(corpo))
}

func assinaHermes(rota, ts string, corpo []byte, seedB64 string) (string, error) {
	return assina(mensagemHermes(rota, ts, corpo), seedB64)
}

// provaAdocaoHermes: assinatura de `agente_existente` na ativação por adoção (o "corpo" é
// instalacao_id + "\n" + machine_id_hash). Usada pelo instalador (P10).
func provaAdocaoHermes(instalacaoID, machineIDHash, ts, seedB64 string) (string, error) {
	return assinaHermes("ativacao", ts, []byte(instalacaoID+"\n"+machineIDHash), seedB64)
}

// ── corpo do sync (esquemaSync ESTRITO: campo a mais = 422) ──

type containerSync struct {
	Estado     string `json:"estado"`
	Saude      string `json:"saude,omitempty"`
	Versao     string `json:"versao,omitempty"`
	Sha        string `json:"sha,omitempty"`
	Digest     string `json:"digest,omitempty"`
	CanalEmUso string `json:"canal_em_uso,omitempty"`
	IniciadoEm string `json:"iniciado_em,omitempty"`
	// a cadeia imagem↔agente fecha (label licenca-chave=real e fp igual ao do hermesPK)
	ChaveConfigurada *bool `json:"chave_configurada,omitempty"`
}

type fingerprintHermes struct {
	MachineIDHash string `json:"machine_id_hash"`
	BootID        string `json:"boot_id,omitempty"`
	HostnameHash  string `json:"hostname_hash,omitempty"`
	SO            string `json:"so,omitempty"`
	DockerVersao  string `json:"docker_versao,omitempty"`
}

type relogioSync struct {
	Confiavel bool `json:"confiavel"`
}

type corpoSyncHermes struct {
	AgenteVersao    string            `json:"agente_versao,omitempty"`
	Container       containerSync     `json:"container"`
	Fingerprint     fingerprintHermes `json:"fingerprint"`
	Relogio         relogioSync       `json:"relogio"`
	Eventos         []EventoHermes    `json:"eventos,omitempty"`
	UltimoEmitidoEm string            `json:"ultimo_emitido_em,omitempty"`
}

var (
	estadosContainer = map[string]bool{"rodando": true, "parado": true, "ausente": true, "desconhecido": true}
	saudesContainer  = map[string]bool{"saudavel": true, "nao_saudavel": true, "iniciando": true, "desconhecida": true}
	severidades      = map[string]bool{"info": true, "aviso": true, "critico": true}
)

func isoValido(s string) bool {
	_, err := time.Parse(time.RFC3339Nano, s)
	return err == nil
}

// chaveConfiguradaNaImagem: true SÓ se a imagem em uso traz org.aramo.hermes.licenca-chave=real
// e org.aramo.hermes.licenca-chave-fp igual ao fp do hermesPK embutido neste agente. É a prova
// que destrava "Passar a valer" no painel (lá, ausente/false = bloqueado).
func chaveConfiguradaNaImagem(info InfoContainer) bool {
	fp := fpChaveHermes(hermesPK)
	return info.LabelConhecido && info.LicencaChave == "real" && fp != "" && info.LicencaChaveFP == fp
}

func soHermes() string {
	if runtime.GOOS == "linux" {
		return corta("linux "+distroLinux(), 80)
	}
	return runtime.GOOS
}

// montaCorpoSync monta o corpo com só os campos do esquema; valor inválido é OMITIDO.
func montaCorpoSync(est *EstadoHermes, info InfoContainer, fp fingerprintHermes) []byte {
	c := containerSync{Estado: info.Estado}
	if !estadosContainer[c.Estado] {
		c.Estado = "desconhecido"
	}
	if saudesContainer[info.Saude] {
		c.Saude = info.Saude
	}
	c.Versao, c.Sha = corta(info.Versao, 40), corta(info.Sha, 64)
	if reDigest.MatchString(info.Digest) {
		c.Digest = info.Digest
	}
	if canalValido(info.CanalEmUso) {
		c.CanalEmUso = info.CanalEmUso
	}
	if isoValido(info.IniciadoEm) {
		c.IniciadoEm = info.IniciadoEm
	}
	if info.LabelConhecido || c.Estado == "ausente" {
		v := chaveConfiguradaNaImagem(info)
		c.ChaveConfigurada = &v
	}
	fp.SO = soHermes()
	fp.DockerVersao = corta(info.DockerVersao, 40)
	fp.BootID = corta(fp.BootID, 64)

	evs := make([]EventoHermes, 0, len(est.Eventos))
	for _, e := range est.Eventos {
		if !severidades[e.Severidade] {
			e.Severidade = ""
		}
		e.Tipo, e.Mensagem = corta(e.Tipo, 40), corta(e.Mensagem, 300)
		if e.Dados != nil {
			if b, err := json.Marshal(e.Dados); err != nil || len(b) > maxDadosEvento {
				e.Dados = nil
			}
		}
		evs = append(evs, e)
	}
	corpo := corpoSyncHermes{
		AgenteVersao: corta(versao, 40),
		Container:    c,
		Fingerprint:  fp,
		Relogio:      relogioSync{Confiavel: !est.RelogioSuspeito},
		Eventos:      evs,
	}
	if isoValido(est.UltimoEmitidoEm) {
		corpo.UltimoEmitidoEm = est.UltimoEmitidoEm
	}
	b, _ := json.Marshal(corpo)
	return b
}

// ── fingerprint da máquina ──

// machineIDHash: sha256 hex do /etc/machine-id (NUNCA o valor cru). Sem machine-id, um id
// aleatório persistido no estado do agente (estável na máquina; um clone o carrega junto).
func machineIDHash() string {
	for _, p := range []string{"/etc/machine-id", "/var/lib/dbus/machine-id"} {
		if b, err := os.ReadFile(p); err == nil {
			if v := strings.TrimSpace(string(b)); v != "" {
				return sha256Hex([]byte(v))
			}
		}
	}
	p := filepath.Join(dirState(), "hermes-machine-id")
	if b, err := os.ReadFile(p); err == nil {
		if v := strings.TrimSpace(string(b)); len(v) >= 16 {
			return sha256Hex([]byte(v))
		}
	}
	r := make([]byte, 16)
	_, _ = rand.Read(r)
	v := hex.EncodeToString(r)
	_ = escreveAtomicoArquivo(p, []byte(v+"\n"), 0o600)
	return sha256Hex([]byte(v))
}

func fingerprintReal(string) fingerprintHermes {
	fp := fingerprintHermes{MachineIDHash: machineIDHash()}
	if b, err := os.ReadFile("/proc/sys/kernel/random/boot_id"); err == nil {
		fp.BootID = strings.TrimSpace(string(b))
	}
	if h, err := os.Hostname(); err == nil && h != "" {
		fp.HostnameHash = sha256Hex([]byte(h))
	}
	return fp
}

// ── transporte ──

type postHermesFn func(url string, corpo []byte, headers map[string]string) (int, []byte, http.Header, error)

func postHermes(url string, corpo []byte, headers map[string]string) (int, []byte, http.Header, error) {
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(corpo))
	if err != nil {
		return 0, nil, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := httpCli.Do(req)
	if err != nil {
		return 0, nil, nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, maxRespostaHermes))
	return resp.StatusCode, b, resp.Header, nil
}

// ── agente ──

type atualizador interface {
	Disparar(canal, digestAlvo string) bool
	Rodando() bool
	Drenar() []EventoHermes
}

type agenteHermes struct {
	cfg           *Config
	hc            ConfigHermes
	exclusivo     bool
	post          postHermesFn
	observar      func(context.Context) InfoContainer
	upd           atualizador
	arq           arquivosHermes
	agora         func() time.Time
	chaves        func() map[string]string
	fp            func(dockerVersao string) fingerprintHermes
	autoAtualiza  func(cfg *Config, alvo, atual string) error
	caminhoEstado string
	trava         func() (func(), error) // nil = sem trava entre processos (testes)

	base          int                  // endereço preferido (troca após falha de rede)
	ultimoDisparo map[string]time.Time // digest_alvo -> último hermes_update disparado
	falhaAgente   map[string]time.Time // agente_alvo -> última falha do auto-update
}

func novoAgenteHermes(cfg *Config, exclusivo bool) *agenteHermes {
	hc := cfg.hermesResolvida()
	d := &driverDocker{
		exec: execInspect, container: hc.Container, repo: "ghcr.io/rvland-devs/hermes",
		arquivoModelo: hc.ArqModelo, arquivoEstado: filepath.Join(hc.DirHermes, "estado.json"), agora: time.Now,
	}
	return &agenteHermes{
		cfg: cfg, hc: hc, exclusivo: exclusivo,
		post:     postHermes,
		observar: d.Observar,
		upd: &atualizadorHermes{
			caminho: hc.HermesImagem, timeout: timeoutUpdateHermes, exec: execUpdate, usaScope: scopeSystemdDisponivel,
		},
		arq:           arquivosHermes{dirLicenca: hc.DirLicenca, dirHermes: hc.DirHermes},
		agora:         time.Now,
		chaves:        chavesHermes,
		fp:            fingerprintReal,
		autoAtualiza:  autoAtualiza,
		caminhoEstado: caminhoEstadoHermes(),
		trava:         travaHermes,
	}
}

func (a *agenteHermes) endereco() string {
	if len(a.cfg.Enderecos) == 0 {
		return ""
	}
	return strings.TrimRight(a.cfg.Enderecos[a.base%len(a.cfg.Enderecos)], "/")
}

// enviar assina `corpo` na `rota` com o timestamp dado e posta no endereço preferido.
func (a *agenteHermes) enviar(rota, caminho, ts string, corpo []byte) (int, []byte, http.Header, error) {
	sig, err := assinaHermes(rota, ts, corpo, a.cfg.SeedB64)
	if err != nil {
		return 0, nil, nil, err
	}
	base := a.endereco()
	if base == "" {
		return 0, nil, nil, errors.New("nenhum endereço configurado")
	}
	return a.post(base+caminho, corpo, map[string]string{
		"X-RVLand-Servidor":   a.cfg.ServidorID,
		"X-RVLand-Timestamp":  ts,
		"X-RVLand-Assinatura": sig,
	})
}

func erroDe(corpo []byte) (codigo, agora string) {
	var e struct {
		Erro  string `json:"erro"`
		Agora string `json:"agora"`
	}
	_ = json.Unmarshal(corpo, &e)
	return e.Erro, e.Agora
}

// retryAfter: segundos (ou data HTTP) do header; ausente/inválido = padrão.
func retryAfter(h http.Header, agora time.Time, padrao time.Duration) time.Duration {
	v := strings.TrimSpace(h.Get("Retry-After"))
	if n, err := strconv.Atoi(v); err == nil && n > 0 {
		return min(time.Duration(n)*time.Second, 6*time.Hour)
	}
	if t, err := http.ParseTime(v); err == nil && t.After(agora) {
		return min(t.Sub(agora), 6*time.Hour)
	}
	return padrao
}

type respSyncHermes struct {
	Licenca      json.RawMessage `json:"licenca"`
	Agora        string          `json:"agora"`
	IntervaloSeg int             `json:"intervalo_seg"`
	Canal        string          `json:"canal"`
	DigestAlvo   *string         `json:"digest_alvo"`
	AgenteAlvo   *struct {
		Versao string `json:"versao"`
	} `json:"agente_alvo"`
}

// cicloSeguro: trava entre processos + recover (um bug aqui nunca derruba o agente do Credit).
func (a *agenteHermes) cicloSeguro() (espera time.Duration) {
	defer func() {
		if r := recover(); r != nil {
			logf("hermes: falha interna no ciclo: %v", r)
			espera = esperaPadraoHermes
		}
	}()
	if a.trava != nil {
		solta, err := a.trava()
		if err != nil {
			logf("hermes: não consegui a trava do estado: %v", err)
			return esperaPadraoHermes
		}
		defer solta()
	}
	return a.ciclo()
}

// ciclo faz um sync (com no máximo uma retentativa por RELOGIO) e devolve a espera até o próximo.
func (a *agenteHermes) ciclo() time.Duration {
	est := carregaEstadoHermes(a.caminhoEstado)
	salva := func() {
		if err := salvaEstadoHermes(a.caminhoEstado, est); err != nil {
			logf("hermes: não consegui gravar o estado: %v", err)
		}
	}
	for _, ev := range a.upd.Drenar() {
		enfileiraEvento(est, ev)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	info := a.observar(ctx)
	cancel()
	// checagem LOCAL em todo ciclo (com ou sem RV): só DESARMA obrigatoria se o container
	// recusaria o que está no disco; nunca cria nada
	a.revisaLocal(est, info)

	agoraC := agoraCorrigida(est, a.agora())
	if est.SemInstalacao && agoraC.UnixMilli() < est.ProximaMs {
		salva()
		// teto: relógio que volta não pode adiar a sonda além de 6 h
		return min(time.Duration(est.ProximaMs-agoraC.UnixMilli())*time.Millisecond, espera404Hermes)
	}

	for tentativa := 0; tentativa < 2; tentativa++ {
		agoraC = agoraCorrigida(est, a.agora())
		if w := esperaLimite(est, agoraC); w > 0 {
			salva()
			return w
		}
		corpo := montaCorpoSync(est, info, a.fp(info.DockerVersao))
		enviados := len(est.Eventos)
		tsT := proximoTimestamp(est, agoraC)
		ts := formatoTs(tsT)
		est.UltimoTsMs = tsT.UnixMilli()
		registraEnvio(est, agoraC)
		// o timestamp vai para o disco ANTES do envio: nunca se repete uma requisição assinada
		if err := salvaEstadoHermes(a.caminhoEstado, est); err != nil {
			logf("hermes: sync adiado, não consegui gravar o estado: %v", err)
			return esperaPadraoHermes
		}

		inicio := a.agora()
		status, resp, hdr, err := a.enviar("sync", rotaSyncHermes, ts, corpo)
		localMeio := inicio.Add(a.agora().Sub(inicio) / 2)
		if err != nil {
			// FAIL-OPEN: documento e marcadores ficam como estão
			est.UltimoErro = "rede: " + err.Error()
			logf("hermes: sync falhou (%v); mantendo o último documento válido", err)
			a.base++
			// resultado desconhecido: o servidor pode ter aceitado (resposta perdida)
			est.UltimoAceitoMs = max(est.UltimoAceitoMs, tsT.UnixMilli())
			salva()
			return esperaPadraoHermes
		}
		codigo, agoraSrv := erroDe(resp)
		switch {
		case status == http.StatusOK:
			var r respSyncHermes
			if json.Unmarshal(resp, &r) != nil {
				est.UltimoErro = "resposta 200 ilegível"
				logf("hermes: resposta do sync ilegível; mantendo o último documento válido")
				salva()
				return esperaPadraoHermes
			}
			est.Eventos = est.Eventos[min(enviados, len(est.Eventos)):]
			est.UltimoAceitoMs = max(est.UltimoAceitoMs, tsT.UnixMilli())
			est.SemInstalacao, est.ProximaMs, est.UltimoErro = false, 0, ""
			est.UltimoContato = formatoTs(agoraC)
			alvo := a.aplicar(est, &r, info, localMeio)
			salva()
			if alvo != "" {
				a.atualizaAgente(alvo)
			}
			iv := time.Duration(r.IntervaloSeg) * time.Second
			if iv <= 0 {
				iv = esperaPadraoHermes
			}
			return min(max(iv, 30*time.Second), time.Hour)

		case status == http.StatusConflict && codigo == "RELOGIO":
			t, perr := time.Parse(time.RFC3339Nano, agoraSrv)
			if perr != nil {
				salva()
				return esperaPadraoHermes
			}
			// não foi aceito: o piso volta para min(rejeitado, agora do servidor), mas nunca abaixo do
			// último POSSIVELMENTE aceito (senão viria REPLAY). Um aceito nunca passa de agora+5 min
			// (janela do servidor), o que limita um "possivelmente aceito" de relógio adiantado.
			est.UltimoTsMs = pisoAposRelogio(est.UltimoAceitoMs, tsT.UnixMilli(), t.UnixMilli())
			medeRelogio(est, t, localMeio)
			est.UltimoErro = "relógio fora da janela do servidor"
			logf("hermes: relógio local fora da janela (servidor %s); retentando com o relógio corrigido", agoraSrv)
			salva()
			continue

		case status == http.StatusConflict:
			// REPLAY: o próximo ciclo já gera um timestamp maior (nunca repete a assinada)
			est.UltimoErro = "REPLAY"
			logf("hermes: servidor recusou o timestamp (REPLAY); o próximo sync usa um maior")
			salva()
			return esperaPadraoHermes

		case status == http.StatusUnauthorized:
			est.UltimoErro = "401 AGENTE_NAO_AUTENTICADO"
			logf("hermes: sync não autenticado (401): confira a chave e o servidor; nova tentativa em %s", espera401Hermes)
			salva()
			return espera401Hermes

		case status == http.StatusNotFound && codigo == "SEM_INSTALACAO":
			est.SemInstalacao = true
			est.ProximaMs = agoraC.Add(espera404Hermes).UnixMilli()
			est.UltimoErro = "404 SEM_INSTALACAO"
			// documento e marcadores ficam como estão (decisão do dono; falta um documento assinado
			// de desinstalação para o agente poder desarmar com segurança)
			logf("hermes: servidor sem instalação Hermes (404): ciclo de licença parado (sonda a cada %s); marcadores mantidos", espera404Hermes)
			salva()
			return espera404Hermes

		case status == http.StatusUnprocessableEntity || status == http.StatusBadRequest || status == http.StatusRequestEntityTooLarge:
			if status == http.StatusUnprocessableEntity {
				est.Eventos = nil // o corpo pode ter ficado inválido por um evento
			}
			est.UltimoErro = fmt.Sprintf("%d %s", status, codigo)
			logf("hermes: corpo do sync recusado (%d %s)", status, codigo)
			salva()
			return esperaCorpoHermes

		case status == http.StatusTooManyRequests:
			salva()
			return retryAfter(hdr, a.agora(), espera429Hermes)

		case status == http.StatusServiceUnavailable:
			// o servidor gravou o estado (e os eventos) e consumiu o timestamp, mas não assinou:
			// mantém o último documento
			est.Eventos = est.Eventos[min(enviados, len(est.Eventos)):]
			est.UltimoAceitoMs = max(est.UltimoAceitoMs, tsT.UnixMilli())
			est.UltimoErro = "503 INDISPONIVEL"
			logf("hermes: RV indisponível (503); mantendo o último documento válido")
			salva()
			return esperaPadraoHermes

		default:
			// 5xx etc.: o servidor pode ter consumido o timestamp antes de falhar
			est.UltimoAceitoMs = max(est.UltimoAceitoMs, tsT.UnixMilli())
			est.UltimoErro = fmt.Sprintf("HTTP %d", status)
			logf("hermes: sync respondeu %d; mantendo o último documento válido", status)
			salva()
			return esperaPadraoHermes
		}
	}
	salva()
	return esperaPadraoHermes
}

// aplicar trata um 200: relógio, documento/marcadores, canal e updates. Devolve a versão-alvo
// do agente (vazia se nada a fazer), que só é aplicada DEPOIS de o estado ir para o disco.
func (a *agenteHermes) aplicar(est *EstadoHermes, r *respSyncHermes, info InfoContainer, localMeio time.Time) string {
	if t, err := time.Parse(time.RFC3339Nano, r.Agora); err == nil {
		medeRelogio(est, t, localMeio)
	}
	agoraC := agoraCorrigida(est, a.agora())
	a.aplicarDocumento(est, r.Licenca, info, agoraC)

	canal := r.Canal
	if canalValido(canal) {
		if mudou, err := a.arq.gravarCanal(canal); err != nil {
			logf("hermes: não consegui gravar rv/canal: %v", err)
		} else if mudou {
			logf("hermes: canal do RV agora é %s", canal)
		}
	} else if canal = info.CanalEmUso; !canalValido(canal) {
		canal = a.hc.Canal
	}

	if r.DigestAlvo != nil && reDigest.MatchString(*r.DigestAlvo) && *r.DigestAlvo != info.Digest {
		alvo := *r.DigestAlvo
		if a.ultimoDisparo == nil {
			a.ultimoDisparo = map[string]time.Time{}
		}
		if ult, ok := a.ultimoDisparo[alvo]; !ok || a.agora().Sub(ult) >= reenvioDigestHermes {
			if a.upd.Disparar(canal, alvo) {
				a.ultimoDisparo[alvo] = a.agora()
			}
		}
	}

	if a.exclusivo && r.AgenteAlvo != nil && r.AgenteAlvo.Versao != "" && r.AgenteAlvo.Versao != versao {
		return r.AgenteAlvo.Versao
	}
	return ""
}

// atualizaAgente reusa o auto-update do agente (release assinada; troca atômica com rollback).
// Nunca durante um hermes_update (o restart do serviço mataria o hermes-imagem) e, depois de
// uma falha, só tenta a mesma versão de novo após 1 h.
func (a *agenteHermes) atualizaAgente(alvo string) {
	if a.upd.Rodando() || len(a.cfg.Enderecos) == 0 {
		return
	}
	if a.falhaAgente == nil {
		a.falhaAgente = map[string]time.Time{}
	}
	if t, ok := a.falhaAgente[alvo]; ok && a.agora().Sub(t) < reenvioAgenteHermes {
		return
	}
	if err := a.autoAtualiza(a.cfg, alvo, versao); err != nil {
		a.falhaAgente[alvo] = a.agora()
		logf("hermes: auto-update do agente para %s falhou: %v (segue na %s)", alvo, err, versao)
	}
}

// avisoContainer enfileira (uma vez por motivo) o aviso de documento que o CONTAINER recusaria.
func avisoContainer(est *EstadoHermes, tipo, sev, msg string) {
	logf("hermes: %s", msg)
	if est.AvisoContainer == msg {
		return
	}
	est.AvisoContainer = msg
	enfileiraEvento(est, EventoHermes{Tipo: tipo, Severidade: sev, Mensagem: msg})
}

// pisoAposRelogio: piso do timestamp depois de um RELOGIO (ms).
//
//	max( min(último possivelmente aceito, agora_servidor + 4 min 30 s), min(rejeitado, agora_servidor) )
//
// Um timestamp aceito nunca passa de agora_servidor + 5 min; o teto de 4 min 30 s deixa a
// retentativa (piso + 1 ms) DENTRO da janela. Se um aceito real estiver nesses últimos 30 s, o
// pior caso é um REPLAY que se resolve no ciclo seguinte (nunca um loop de RELOGIO).
func pisoAposRelogio(possivelAceito, rejeitado, agoraServidor int64) int64 {
	teto := agoraServidor + (janelaServidorHermes - 30*time.Second).Milliseconds()
	return max(min(possivelAceito, teto), min(rejeitado, agoraServidor))
}

// containerAceitaria: o verificador do container (licenca/nucleo.mjs) aceitaria `b`? Usa o
// relógio do HOST, o HERMES_INSTALACAO_ID do container e a chave h1 da IMAGEM: se o label fp
// está presente e difere do hermesPK do agente, o container não verifica nada que o agente
// aceita. Devolve o tipo de evento adequado ao motivo.
func (a *agenteHermes) containerAceitaria(b []byte, info InfoContainer, chaves map[string]string) (ok bool, tipo, motivo string) {
	if info.LabelConhecido && info.LicencaChaveFP != "" && info.LicencaChaveFP != fpChaveHermes(chaves["h1"]) {
		return false, "hermes_adulteracao", fmt.Sprintf("a imagem do Hermes em uso tem outra chave h1 (fp %.16s…, o agente usa %.16s…)", info.LicencaChaveFP, fpChaveHermes(chaves["h1"]))
	}
	host := a.agora()
	if _, err := verificarDocHermes(b, opcoesDoc{chaves: chaves, agora: host}); err != nil {
		return false, "hermes_relogio", fmt.Sprintf("o container o recusaria com o relógio deste servidor (%v); corrija o relógio do host", err)
	}
	if _, err := verificarDocHermes(b, opcoesDoc{chaves: chaves, agora: host, instalacaoID: info.InstalacaoEnv}); err != nil {
		return false, "hermes_adulteracao", "HERMES_INSTALACAO_ID do container difere da instalação do documento"
	}
	return true, "", ""
}

func severidadeAviso(tipo string) string {
	if tipo == "hermes_relogio" {
		return "critico"
	}
	return "aviso"
}

// desarmaObrigatoria remove o marcador (se existir) com log e evento. Nunca cria.
func (a *agenteHermes) desarmaObrigatoria(est *EstadoHermes, tipo, motivo string) {
	if !a.arq.existe(marcadorObrigatoria) {
		return
	}
	if _, err := a.arq.marcador(marcadorObrigatoria, false); err != nil {
		logf("hermes: não consegui remover o marcador obrigatoria: %v", err)
		return
	}
	avisoContainer(est, tipo, severidadeAviso(tipo), "Marcador obrigatoria removido: "+motivo+".")
}

// revisaLocal: em TODO ciclo (inclusive com o RV fora), reavalia o documento do disco como o
// container o faria; se ele o recusaria, REMOVE obrigatoria. Nunca cria nem regrava nada. Sem
// chave h1 válida no agente não há como julgar: não mexe.
func (a *agenteHermes) revisaLocal(est *EstadoHermes, info InfoContainer) {
	chaves := a.chaves()
	if fpChaveHermes(chaves["h1"]) == "" || !a.arq.existe(marcadorObrigatoria) {
		return
	}
	b, err := a.arq.lerDoc()
	if err != nil {
		a.desarmaObrigatoria(est, "hermes_adulteracao", "licenca.json ausente ou ilegível")
		return
	}
	if ok, tipo, motivo := a.containerAceitaria(b, info, chaves); !ok {
		a.desarmaObrigatoria(est, tipo, motivo)
	}
}

// aplicarDocumento (só em 200): documento AUTÊNTICO, não mais antigo que o do disco nem que o
// último aplicado, e aceito TAMBÉM pelo container (containerAceitaria) substitui o atual.
// Autêntico e mais novo mas NÃO entregável (relógio do host, env, chave da imagem): não grava,
// desarma obrigatoria e decide o bloqueio pelo documento RECEBIDO (nunca pelo velho do disco;
// se o recebido não bloqueia, não cria nem remove bloqueio).
func (a *agenteHermes) aplicarDocumento(est *EstadoHermes, raw json.RawMessage, info InfoContainer, agoraC time.Time) {
	chaves := a.chaves()
	opAg := opcoesDoc{chaves: chaves, agora: agoraC, instalacaoID: a.hc.InstalacaoID, servidorID: a.cfg.ServidorID}

	discoB, errLer := a.arq.lerDoc()
	var disco *DocHermes
	discoNoContainer := false
	if errLer == nil {
		disco, _ = verificarDocHermes(discoB, opAg)
		// visão do CONTAINER, independente da do agente (relógio corrigido por um `agora` não
		// assinado, servidor_id de um re-enroll): é ela que diz se o marcador pode ficar
		discoNoContainer, _, _ = a.containerAceitaria(discoB, info, chaves)
		if est.ShaDoc != "" && sha256Hex(discoB) != est.ShaDoc {
			enfileiraEvento(est, EventoHermes{Tipo: "hermes_adulteracao", Severidade: "aviso",
				Mensagem: "licenca.json foi alterado fora do agente RV; o último documento válido é regravado."})
		}
	} else if est.ShaDoc != "" && errors.Is(errLer, os.ErrNotExist) {
		enfileiraEvento(est, EventoHermes{Tipo: "hermes_adulteracao", Severidade: "aviso",
			Mensagem: "licenca.json foi removido fora do agente RV."})
	}
	efetivo := disco // o que fica no disco (o container lê)
	if disco != nil {
		est.ShaDoc = sha256Hex(discoB)
	}
	decisor := disco // documento que decide o bloqueio
	naoEntregue := false
	ultimo, temUltimo := dataHermes(est.UltimoEmitidoEm)

	if len(raw) > 0 && !bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		rec, err := verificarDocHermes(raw, opAg)
		switch {
		case err != nil:
			logf("hermes: documento de licença recusado (%v); mantendo o último válido", err)
		case disco != nil && rec.emitido.Before(disco.emitido), temUltimo && rec.emitido.Before(ultimo):
			logf("hermes: documento recebido (%s) é mais antigo que o último aplicado: ignorado", rec.EmitidoEm)
		default:
			if ok, tipo, motivo := a.containerAceitaria(raw, info, chaves); !ok {
				avisoContainer(est, tipo, severidadeAviso(tipo), "Documento de licença não aplicado: "+motivo+".")
				naoEntregue, decisor, discoNoContainer = true, rec, false
				break
			}
			est.AvisoContainer = ""
			if errLer != nil || !bytes.Equal(discoB, raw) {
				if err := a.arq.gravarDoc(raw); err != nil {
					logf("hermes: não consegui gravar licenca.json: %v", err)
					break
				}
			}
			efetivo, decisor, discoNoContainer = rec, rec, true
			est.ShaDoc = sha256Hex(raw)
		}
	}
	if efetivo != nil && (!temUltimo || !efetivo.emitido.Before(ultimo)) {
		est.UltimoEmitidoEm = efetivo.EmitidoEm
	}
	if fpChaveHermes(chaves["h1"]) != "" {
		a.aplicarObrigatoria(est, efetivo, info, discoNoContainer)
	}
	if decisor == nil {
		return
	}

	bloquear, simulado := decisaoHermes(decisor, agoraC)
	if naoEntregue && !bloquear {
		return // nunca mexe em bloqueio a partir de um documento que não foi entregue
	}
	mudou, err := a.arq.marcador(marcadorBloqueio, bloquear)
	if err != nil {
		logf("hermes: marcador bloqueio: %v", err)
		return
	}

	nova := "liberado"
	if bloquear {
		nova = "bloqueado"
	} else if simulado {
		nova = "simulado"
	}
	if nova == est.Decisao {
		if mudou && bloquear {
			enfileiraEvento(est, EventoHermes{Tipo: "hermes_adulteracao", Severidade: "aviso",
				Mensagem: "o marcador de bloqueio foi removido fora do agente RV e foi recriado."})
		}
		return
	}
	dados := map[string]any{"status": decisor.Status, "modo": decisor.Modo, "offline_ate": decisor.OfflineAte}
	switch nova {
	case "bloqueado":
		logf("hermes: BLOQUEIO da licença (status %s): o hermes-imagem não sobe versões e o container exige licença válida", decisor.Status)
		enfileiraEvento(est, EventoHermes{Tipo: "hermes_bloqueio", Severidade: "critico",
			Mensagem: fmt.Sprintf("Licença do Hermes bloqueada (status %s).", decisor.Status), Dados: dados})
	case "simulado":
		logf("hermes: [simulação] a licença SERIA bloqueada (status %s, modo %s); nada foi bloqueado", decisor.Status, decisor.Modo)
		enfileiraEvento(est, EventoHermes{Tipo: "hermes_bloqueio_simulado", Severidade: "aviso",
			Mensagem: fmt.Sprintf("Simulação: a licença do Hermes seria bloqueada (status %s).", decisor.Status), Dados: dados})
	default:
		if est.Decisao == "bloqueado" {
			logf("hermes: licença liberada (status %s)", decisor.Status)
			enfileiraEvento(est, EventoHermes{Tipo: "hermes_liberado", Severidade: "info",
				Mensagem: fmt.Sprintf("Licença do Hermes liberada (status %s).", decisor.Status), Dados: dados})
		}
	}
	est.Decisao = nova
}

// aplicarObrigatoria decide o marcador `obrigatoria` (sempre DEPOIS do licenca.json gravado):
//   - o container recusaria o documento do disco, ou o documento novo não pôde ser entregue
//     (relógio do host, env, chave h1 da imagem diferente): REMOVE (desarma; nunca arma);
//   - o container aceita o do disco mas o agente não o valida (d == nil): não mexe;
//   - label desconhecido (docker indisponível, sem container): não mexe;
//   - imagem sem chave real (licenca-chave != real): remove;
//   - label fp AUSENTE (imagem antiga): não arma e não derruba;
//   - senão: existe <=> documento do disco com obrigatoria:true.
func (a *agenteHermes) aplicarObrigatoria(est *EstadoHermes, d *DocHermes, info InfoContainer, discoNoContainer bool) {
	quer, motivo := false, ""
	switch {
	case !discoNoContainer:
		a.desarmaObrigatoria(est, "hermes_relogio", "o container recusaria o licenca.json deste servidor")
		return
	case d == nil:
		// o agente não valida o documento do disco (ex.: `agora` do RV atrasado, re-enroll), mas o
		// container o aceita: não mexe no marcador e não alarma
		return
	case !info.LabelConhecido:
		return
	case info.LicencaChave != "real":
		quer, motivo = false, "a imagem em uso não tem a chave pública real"
	case info.LicencaChaveFP == "":
		if d.Obrigatoria && !a.arq.existe(marcadorObrigatoria) && est.AvisoFP != info.Versao {
			est.AvisoFP = info.Versao
			logf("hermes: obrigatoria NÃO armada: a imagem em uso (%s) não declara o fp da chave h1 (label %s)", info.Versao, labelLicencaChaveFP)
		}
		return
	default:
		quer = d.Obrigatoria
	}
	mudou, err := a.arq.marcador(marcadorObrigatoria, quer)
	switch {
	case err != nil:
		logf("hermes: marcador obrigatoria: %v", err)
	case mudou && motivo != "":
		logf("hermes: marcador obrigatoria removido: %s", motivo)
	case mudou:
		logf("hermes: marcador obrigatoria = %v", quer)
	}
}

// iniciaHermes monta o agente do modo Hermes (exclusivo: no lugar do heartbeat; adotado: em
// paralelo) e registra o adiamento do auto-update do agente enquanto o hermes-imagem roda.
// Chamar ANTES de subir as goroutines.
func iniciaHermes(cfg *Config, exclusivo bool) *agenteHermes {
	a := novoAgenteHermes(cfg, exclusivo)
	adiarAutoUpdate = a.upd.Rodando
	limpaSaidasAntigas(os.TempDir(), time.Now())
	if a.hc.InstalacaoID == "" {
		logf("hermes: aviso: instalacao_id não configurado; o documento não terá a instalação conferida")
	}
	if fpChaveHermes(hermesPK) == "" {
		logf("hermes: aviso: chave pública Hermes (h1) não embutida neste build; nenhum documento será aplicado")
	}
	logf("hermes: ciclo de licença iniciado (%s)", map[bool]string{true: "modo hermes", false: "servidor adotado"}[exclusivo])
	return a
}

func (a *agenteHermes) loop() {
	for {
		time.Sleep(a.cicloSeguro())
	}
}
