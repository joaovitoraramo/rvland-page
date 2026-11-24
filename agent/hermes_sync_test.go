package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

// ── vetor cruzado das assinaturas de pedido (gerado com assinarPedidoHermes do RVLand,
// lib/hermes/assinatura-agente.ts, com a seed de TESTE do vetor; Ed25519 é determinístico) ──

func TestAssinaturaHermes_VetorCruzadoComOServidor(t *testing.T) {
	const ts = "2026-11-23T12:00:00.000Z"
	casos := []struct{ rota, corpo, msg, sig string }{
		{"credencial", `{"pedido":"credencial"}`,
			"hermes:credencial:2026-11-23T12:00:00.000Z.e36e5509ba40f9a4c2c38fe1c99c3e0c68410f73ac822a9d130af8f5450cf333",
			"oqrYwpzdvNkWJZP0Jc3lK8UBX4ZJkiBkkZYJHjoSxCKM/BGiu/LlrRkoqnWMBZWZnSJ7h22x6fc2RQe95bXRCw=="},
		{"sync", `{"container":{"estado":"rodando"},"fingerprint":{"machine_id_hash":"0123456789abcdef0123456789abcdef"}}`,
			"hermes:sync:2026-11-23T12:00:00.000Z.5bd2d1cd6649496514251b7696f7f62538eb8f07035646de87d45237db0aac47",
			"eDoaL4rjkFACKPg0nloRAfHknCpytQINN6LcBYHb5gwxQPMMnl1am7yW44elK/BgHiYG0YFHK+9t1zvh1N22CA=="},
		{"ativacao", "inst-vetor-1\n0123456789abcdef0123456789abcdef",
			"hermes:ativacao:2026-11-23T12:00:00.000Z.7ebf525766400104e237d19b65afc1d86a7e4eff42f030df21482a0cf51f81f9",
			"ODNqfCh5XaxAhPMaa5pyVKXY/VlSTQtTf7oUnMbO+PwIKiyHMDn0HjeIUD0nhZ4oQSNK2NlY4rIz8FJ5Ux9jBQ=="},
	}
	for _, c := range casos {
		if got := string(mensagemHermes(c.rota, ts, []byte(c.corpo))); got != c.msg {
			t.Errorf("%s: mensagem\n got %s\nwant %s", c.rota, got, c.msg)
		}
		sig, err := assinaHermes(c.rota, ts, []byte(c.corpo), vetorSeedB64)
		if err != nil || sig != c.sig {
			t.Errorf("%s: assinatura diverge do servidor: %s (%v)", c.rota, sig, err)
		}
	}
	// a prova de adoção usa o mesmo esquema
	if p, _ := provaAdocaoHermes("inst-vetor-1", "0123456789abcdef0123456789abcdef", ts, vetorSeedB64); p != casos[2].sig {
		t.Fatalf("prova de adoção diverge: %s", p)
	}
	// assinatura de uma rota não vale na outra, nem a do heartbeat do Credit
	sync, _ := assinaHermes("sync", ts, []byte(casos[0].corpo), vetorSeedB64)
	if verificaComPub(mensagemHermes("credencial", ts, []byte(casos[0].corpo)), sync, vetorPubB64) {
		t.Fatal("assinatura de sync não pode valer na credencial")
	}
	if verificaComPub(mensagemHeartbeat(ts, []byte(casos[0].corpo)), casos[0].sig, vetorPubB64) {
		t.Fatal("assinatura Hermes não pode valer como heartbeat")
	}
}

// ── mundo de teste: servidor RV falso + docker falso + relógio controlado ──

type pedidoFake struct {
	url     string
	corpo   []byte
	headers map[string]string
}

type respostaFake struct {
	status int
	corpo  string
	hdr    http.Header
	err    error
}

type mundoHermes struct {
	t        *testing.T
	mu       sync.Mutex
	pedidos  []pedidoFake
	fila     []respostaFake
	padrao   respostaFake
	agora    time.Time
	info     InfoContainer
	upd      *updFake
	alvos    []string
	falhaAlv error
	pub      string
}

type updFake struct {
	mu       sync.Mutex
	disparos []string
	rodando  bool
	eventos  []EventoHermes
}

func (u *updFake) Disparar(canal, digest string) bool {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.rodando {
		return false
	}
	u.disparos = append(u.disparos, canal+" "+digest)
	return true
}
func (u *updFake) Rodando() bool { u.mu.Lock(); defer u.mu.Unlock(); return u.rodando }
func (u *updFake) Drenar() []EventoHermes {
	u.mu.Lock()
	defer u.mu.Unlock()
	e := u.eventos
	u.eventos = nil
	return e
}

func novoMundo(t *testing.T, exclusivo bool) (*mundoHermes, *agenteHermes) {
	t.Helper()
	hermesPK = vetorPubB64
	t.Cleanup(func() { hermesPK = "" })
	seed, pub := geraChaveAgente()
	base := t.TempDir()
	m := &mundoHermes{
		t:      t,
		agora:  tempo(t, vetorAgora),
		info:   InfoContainer{Estado: "rodando", Saude: "saudavel", Versao: "0.14.27", Digest: digestTeste, LicencaChave: "real", LicencaChaveFP: fpChaveHermes(vetorPubB64), LabelConhecido: true},
		upd:    &updFake{},
		padrao: respostaFake{status: 200, corpo: respOK(vetorEnvelope(), "preview", nil, nil)},
		pub:    pub,
	}
	cfg := &Config{
		Enderecos:  []string{"https://rv.teste"},
		ServidorID: vetorServidor,
		SeedB64:    seed,
		Modo:       map[bool]string{true: "hermes", false: ""}[exclusivo],
		Hermes:     &ConfigHermes{InstalacaoID: vetorInstalacao},
	}
	a := &agenteHermes{
		cfg:       cfg,
		hc:        cfg.hermesResolvida(),
		exclusivo: exclusivo,
		post:      m.post,
		observar:  func(context.Context) InfoContainer { return m.info },
		upd:       m.upd,
		arq:       arquivosHermes{dirLicenca: filepath.Join(base, "licenca"), dirHermes: base},
		agora:     func() time.Time { return m.agora },
		chaves:    chavesHermes,
		fp: func(string) fingerprintHermes {
			return fingerprintHermes{MachineIDHash: strings.Repeat("ab", 32), BootID: "boot-1"}
		},
		autoAtualiza: func(_ *Config, alvo, atual string) error {
			m.alvos = append(m.alvos, alvo)
			return m.falhaAlv
		},
		caminhoEstado: filepath.Join(base, "estado", "hermes.json"),
	}
	return m, a
}

func respOK(licenca []byte, canal string, digest *string, agenteAlvo *string) string {
	r := map[string]any{
		"licenca": json.RawMessage(licenca), "agora": "__AGORA__", "intervalo_seg": 60,
		"canal": canal, "digest_alvo": digest, "agente_alvo": nil,
	}
	if agenteAlvo != nil {
		r["agente_alvo"] = map[string]any{"versao": *agenteAlvo, "url": nil, "sha256": nil}
	}
	b, _ := json.Marshal(r)
	return string(b)
}

func (m *mundoHermes) post(url string, corpo []byte, headers map[string]string) (int, []byte, http.Header, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.pedidos = append(m.pedidos, pedidoFake{url, append([]byte(nil), corpo...), headers})
	// todo pedido tem de vir assinado com a chave do servidor, no domínio da rota
	rota := "sync"
	if strings.HasSuffix(url, "/credencial") {
		rota = "credencial"
	}
	if !verificaComPub(mensagemHermes(rota, headers["X-RVLand-Timestamp"], corpo), headers["X-RVLand-Assinatura"], m.pub) {
		m.t.Errorf("pedido %s com assinatura inválida", url)
	}
	r := m.padrao
	if len(m.fila) > 0 {
		r, m.fila = m.fila[0], m.fila[1:]
	}
	if r.hdr == nil {
		r.hdr = http.Header{}
	}
	// o servidor responde com o relógio dele (= o do teste, salvo quando o caso define)
	return r.status, []byte(strings.ReplaceAll(r.corpo, "__AGORA__", formatoTs(m.agora))), r.hdr, r.err
}

func (m *mundoHermes) existe(a *agenteHermes, nome string) bool { return a.arq.existe(nome) }

func corpoDe(t *testing.T, p pedidoFake) map[string]any {
	t.Helper()
	var c map[string]any
	if err := json.Unmarshal(p.corpo, &c); err != nil {
		t.Fatal(err)
	}
	return c
}

// ── testes do ciclo ──

func TestSync_CorpoNoEsquemaEstrito(t *testing.T) {
	m, a := novoMundo(t, true)
	m.info.CanalEmUso = "preview"
	m.info.IniciadoEm = "2026-11-23T11:00:00.000Z"
	m.info.DockerVersao = "29.6.1"
	a.ciclo()
	if len(m.pedidos) != 1 {
		t.Fatalf("esperado 1 sync, houve %d", len(m.pedidos))
	}
	p := m.pedidos[0]
	if p.url != "https://rv.teste/api/agente/hermes" || p.headers["X-RVLand-Servidor"] != vetorServidor || p.headers["X-RVLand-Timestamp"] != vetorAgora {
		t.Fatalf("pedido errado: %s %v", p.url, p.headers)
	}
	c := corpoDe(t, p)
	chaves := func(m map[string]any) string {
		var k []string
		for x := range m {
			k = append(k, x)
		}
		sort.Strings(k)
		return strings.Join(k, ",")
	}
	if got := chaves(c); got != "agente_versao,container,fingerprint,relogio" {
		t.Fatalf("chaves do corpo (esquemaSync é estrito): %s", got)
	}
	if got := chaves(c["container"].(map[string]any)); got != "canal_em_uso,chave_configurada,digest,estado,iniciado_em,saude,versao" {
		t.Fatalf("chaves de container: %s", got)
	}
	if got := chaves(c["fingerprint"].(map[string]any)); got != "boot_id,docker_versao,machine_id_hash,so" {
		t.Fatalf("chaves de fingerprint: %s", got)
	}
	if c["relogio"].(map[string]any)["confiavel"] != true {
		t.Fatal("relógio deveria ir confiável")
	}
	// no segundo sync vai o emitido_em do documento aplicado
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if corpoDe(t, m.pedidos[1])["ultimo_emitido_em"] != "2026-11-20T12:00:00.000Z" {
		t.Fatalf("ultimo_emitido_em ausente: %s", m.pedidos[1].corpo)
	}
	// campos inválidos são omitidos (o servidor responderia 422)
	m.info = InfoContainer{Estado: "rodando", Digest: "sha256:curto", CanalEmUso: "latest", Saude: "talvez"}
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	cont := corpoDe(t, m.pedidos[2])["container"].(map[string]any)
	if got := chaves(cont); got != "estado" {
		t.Fatalf("campos inválidos deveriam ser omitidos: %s", got)
	}
}

func TestSync_200GravaDocumentoMarcadorECanal(t *testing.T) {
	m, a := novoMundo(t, true)
	espera := a.ciclo()
	if espera != 60*time.Second {
		t.Fatalf("intervalo: %v", espera)
	}
	b, err := a.arq.lerDoc()
	if err != nil || string(b) != string(vetorEnvelope()) {
		t.Fatalf("licenca.json deveria ter os bytes recebidos: %v", err)
	}
	if !m.existe(a, "obrigatoria") {
		t.Fatal("documento obrigatoria:true + label real => marcador obrigatoria")
	}
	if m.existe(a, "bloqueio") {
		t.Fatal("licença em dia não cria bloqueio")
	}
	c, _ := os.ReadFile(filepath.Join(a.arq.dirHermes, "rv", "canal"))
	if string(c) != "preview\n" {
		t.Fatalf("rv/canal: %q", c)
	}
	if len(m.alvos) != 0 || len(m.upd.disparos) != 0 {
		t.Fatal("sem agente_alvo/digest_alvo nada é atualizado")
	}
}

func TestSync_ObrigatoriaSoComLabelReal(t *testing.T) {
	m, a := novoMundo(t, true)
	m.info.LicencaChave = "placeholder"
	a.ciclo()
	if m.existe(a, "obrigatoria") {
		t.Fatal("imagem com chave placeholder NUNCA recebe o marcador obrigatoria")
	}
	m.info.LicencaChave = ""
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if m.existe(a, "obrigatoria") {
		t.Fatal("label ausente NUNCA recebe o marcador obrigatoria")
	}
	m.info.LicencaChave = "real"
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if !m.existe(a, "obrigatoria") {
		t.Fatal("label real deveria criar o marcador")
	}
	// docker indisponível: não se sabe o label => não mexe (nem cria nem remove)
	m.info = InfoContainer{Estado: "desconhecido"}
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if !m.existe(a, "obrigatoria") {
		t.Fatal("label desconhecido não pode remover o marcador")
	}
	// trocou para imagem placeholder: remove
	m.info = InfoContainer{Estado: "rodando", LabelConhecido: true, LicencaChave: "placeholder"}
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if m.existe(a, "obrigatoria") {
		t.Fatal("imagem placeholder deveria remover o marcador")
	}
}

func docVariante(t *testing.T, muda func(p map[string]any)) []byte {
	p := payloadVetor(t)
	muda(p)
	return envelopeTeste(t, p, "h1")
}

func TestSync_BloqueioSimulacaoERecuperacao(t *testing.T) {
	m, a := novoMundo(t, true)
	bloq := docVariante(t, func(p map[string]any) {
		p["emitido_em"] = "2026-11-23T11:00:00.000Z"
		p["status"], p["bloqueante"] = "vencida", true
	})
	m.padrao = respostaFake{status: 200, corpo: respOK(bloq, "stable", nil, nil)}
	a.ciclo()
	if !m.existe(a, "bloqueio") {
		t.Fatal("valendo + bloqueante => bloqueio")
	}
	// o evento vai no próximo sync
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	evs := corpoDe(t, m.pedidos[1])["eventos"]
	if evs == nil || !strings.Contains(fmt.Sprint(evs), "hermes_bloqueio") {
		t.Fatalf("evento hermes_bloqueio deveria ter sido enviado: %s", m.pedidos[1].corpo)
	}
	// pagou: documento novo em dia => remove o bloqueio e avisa
	pago := docVariante(t, func(p map[string]any) { p["emitido_em"] = "2026-11-23T11:30:00.000Z" })
	m.padrao = respostaFake{status: 200, corpo: respOK(pago, "stable", nil, nil)}
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if m.existe(a, "bloqueio") {
		t.Fatal("licença regularizada deveria remover o bloqueio")
	}
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if !strings.Contains(string(m.pedidos[3].corpo), "hermes_liberado") {
		t.Fatalf("evento hermes_liberado esperado: %s", m.pedidos[3].corpo)
	}
	// simulação: nunca cria bloqueio, só registra
	sim := docVariante(t, func(p map[string]any) {
		p["emitido_em"] = "2026-11-23T11:40:00.000Z"
		p["modo"], p["bloqueante"] = "simulacao", true
	})
	m.padrao = respostaFake{status: 200, corpo: respOK(sim, "stable", nil, nil)}
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if m.existe(a, "bloqueio") || !strings.Contains(string(m.pedidos[5].corpo), "hermes_bloqueio_simulado") {
		t.Fatalf("simulação não bloqueia e registra: %s", m.pedidos[5].corpo)
	}
	// pânico: também não bloqueia
	pan := docVariante(t, func(p map[string]any) {
		p["emitido_em"] = "2026-11-23T11:50:00.000Z"
		p["panico"], p["bloqueante"] = true, true
	})
	m.padrao = respostaFake{status: 200, corpo: respOK(pan, "stable", nil, nil)}
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if m.existe(a, "bloqueio") {
		t.Fatal("pânico não bloqueia")
	}
}

func TestSync_DocumentoInvalidoOuAntigoNaoSubstitui(t *testing.T) {
	m, a := novoMundo(t, true)
	a.ciclo()
	original, _ := a.arq.lerDoc()

	invalidos := map[string][]byte{
		"kid errado":                       envelopeTeste(t, payloadVetor(t), "h2"),
		"assinatura de outro":              []byte(strings.Replace(string(vetorEnvelope()), "m16f1", "m16f2", 1)),
		"outra instalação":                 docVariante(t, func(p map[string]any) { p["instalacao_id"] = "x"; p["emitido_em"] = "2026-11-23T11:00:00.000Z" }),
		"mais antigo":                      docVariante(t, func(p map[string]any) { p["emitido_em"] = "2026-11-19T12:00:00.000Z"; p["bloqueante"] = true }),
		"bloqueante sem assinatura válida": []byte(`{"payload":"eyJ0aXBvIjoiaGVybWVzX2xpY2VuY2EifQ==","assinatura":"` + vetorAssinatura + `","kid":"h1"}`),
	}
	for nome, doc := range invalidos {
		m.padrao = respostaFake{status: 200, corpo: respOK(doc, "stable", nil, nil)}
		m.agora = m.agora.Add(61 * time.Second)
		a.ciclo()
		atual, _ := a.arq.lerDoc()
		if string(atual) != string(original) {
			t.Fatalf("%s: substituiu o último documento válido", nome)
		}
		if m.existe(a, "bloqueio") || !m.existe(a, "obrigatoria") {
			t.Fatalf("%s: marcadores mudaram por documento recusado", nome)
		}
	}
}

func TestSync_ChavePlaceholderNuncaGravaNada(t *testing.T) {
	m, a := novoMundo(t, true)
	hermesPK = ""
	a.ciclo()
	if _, err := a.arq.lerDoc(); err == nil || m.existe(a, "obrigatoria") || m.existe(a, "bloqueio") {
		t.Fatal("sem chave pública real o agente não grava documento nem marcadores")
	}
}

func TestSync_FailOpen(t *testing.T) {
	m, a := novoMundo(t, true)
	// estado inicial: bloqueado por documento válido
	bloq := docVariante(t, func(p map[string]any) { p["emitido_em"] = "2026-11-23T11:00:00.000Z"; p["bloqueante"] = true })
	m.padrao = respostaFake{status: 200, corpo: respOK(bloq, "stable", nil, nil)}
	a.ciclo()
	if !m.existe(a, "bloqueio") {
		t.Fatal("pré-condição: bloqueio")
	}
	doc, _ := a.arq.lerDoc()
	falhas := []respostaFake{
		{err: errors.New("dial tcp: connection refused")},
		{status: 503, corpo: `{"erro":"INDISPONIVEL"}`},
		{status: 500, corpo: `oops`},
		{status: 502, corpo: `<html>`},
		{status: 200, corpo: `não é json`},
	}
	for _, f := range falhas {
		m.padrao = f
		m.agora = m.agora.Add(61 * time.Second)
		if w := a.ciclo(); w != 60*time.Second {
			t.Fatalf("falha %v deveria tentar no próximo ciclo (60 s), espera %v", f, w)
		}
		atual, _ := a.arq.lerDoc()
		if string(atual) != string(doc) || !m.existe(a, "bloqueio") || !m.existe(a, "obrigatoria") {
			t.Fatalf("falha %v mexeu no documento/marcadores", f)
		}
	}
	// e falha de rede nunca CRIA bloqueio
	m2, a2 := novoMundo(t, true)
	m2.padrao = respostaFake{err: errors.New("timeout")}
	a2.ciclo()
	if m2.existe(a2, "bloqueio") || m2.existe(a2, "obrigatoria") {
		t.Fatal("falha de rede não cria marcador")
	}
}

func TestSync_RelogioRetentaComRelogioCorrigido(t *testing.T) {
	m, a := novoMundo(t, true)
	servidor := m.agora.Add(10 * time.Minute)
	m.fila = []respostaFake{{status: 409, corpo: `{"erro":"RELOGIO","agora":"` + formatoTs(servidor) + `"}`}}
	m.padrao = respostaFake{status: 200, corpo: strings.Replace(respOK(vetorEnvelope(), "stable", nil, nil), "__AGORA__", formatoTs(servidor), 1)}
	a.ciclo()
	if len(m.pedidos) != 2 {
		t.Fatalf("RELOGIO deveria retentar uma vez no mesmo ciclo, houve %d pedidos", len(m.pedidos))
	}
	ts2 := tempo(t, m.pedidos[1].headers["X-RVLand-Timestamp"])
	if d := ts2.Sub(servidor); d < 0 || d > time.Second {
		t.Fatalf("retentativa deveria usar o relógio corrigido (~%s), usou %s", formatoTs(servidor), formatoTs(ts2))
	}
	if corpoDe(t, m.pedidos[1])["relogio"].(map[string]any)["confiavel"] != false {
		t.Fatal("retentativa deveria reportar relógio não confiável")
	}
	est := carregaEstadoHermes(a.caminhoEstado)
	if est.OffsetMs != (10*time.Minute).Milliseconds() || !est.RelogioSuspeito {
		t.Fatalf("offset não persistido: %+v", est)
	}
	// o relógio da máquina não foi tocado: o agente só guarda o offset
	if !a.agora().Equal(m.agora) {
		t.Fatal("relógio local não pode mudar")
	}
	// segundo RELOGIO seguido: não insiste (espera o próximo ciclo)
	m2, a2 := novoMundo(t, true)
	rel := respostaFake{status: 409, corpo: `{"erro":"RELOGIO","agora":"` + formatoTs(m2.agora.Add(time.Hour)) + `"}`}
	m2.padrao = rel
	a2.ciclo()
	if len(m2.pedidos) != 2 {
		t.Fatalf("no máximo 2 tentativas por ciclo, houve %d", len(m2.pedidos))
	}
}

func TestSync_ReplayGeraTimestampMaiorSemRepetir(t *testing.T) {
	m, a := novoMundo(t, true)
	m.fila = []respostaFake{{status: 409, corpo: `{"erro":"REPLAY"}`}}
	w := a.ciclo()
	if len(m.pedidos) != 1 || w != 60*time.Second {
		t.Fatalf("REPLAY: sem retentativa imediata (%d pedidos, espera %v)", len(m.pedidos), w)
	}
	// mesmo relógio (parado) no ciclo seguinte: timestamp ESTRITAMENTE maior, assinatura nova
	m.agora = m.agora.Add(61 * time.Second)
	m.agora = m.agora.Add(-61 * time.Second) // relógio voltou
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	t1, t2 := m.pedidos[0].headers["X-RVLand-Timestamp"], m.pedidos[1].headers["X-RVLand-Timestamp"]
	if !(t2 > t1) || m.pedidos[0].headers["X-RVLand-Assinatura"] == m.pedidos[1].headers["X-RVLand-Assinatura"] {
		t.Fatalf("timestamps %s -> %s", t1, t2)
	}
}

func TestSync_TimestampPersistidoSobreviveReinicioERelogioQueVolta(t *testing.T) {
	m, a := novoMundo(t, true)
	a.ciclo()
	t1 := m.pedidos[0].headers["X-RVLand-Timestamp"]
	// "reinício": agente novo, mesmo arquivo de estado, relógio 1 h atrás
	a2 := *a
	a2.ultimoDisparo, a2.falhaAgente = nil, nil
	m.agora = m.agora.Add(-time.Hour)
	a2.ciclo()
	if len(m.pedidos) != 2 {
		// o limite de 2/60 s não pode travar por causa do relógio que voltou além de 60 s
		t.Fatalf("esperado 2 pedidos, houve %d", len(m.pedidos))
	}
	t2 := m.pedidos[1].headers["X-RVLand-Timestamp"]
	if !(t2 > t1) {
		t.Fatalf("timestamp regrediu após reinício: %s -> %s", t1, t2)
	}
}

func TestSync_NoMaximoDoisSyncsEm60s(t *testing.T) {
	m, a := novoMundo(t, true)
	a.ciclo()
	m.agora = m.agora.Add(time.Second)
	a.ciclo()
	m.agora = m.agora.Add(time.Second)
	w := a.ciclo()
	if len(m.pedidos) != 2 {
		t.Fatalf("terceiro sync em 60 s não pode sair: %d pedidos", len(m.pedidos))
	}
	if w <= 0 || w > 60*time.Second {
		t.Fatalf("deveria esperar a janela: %v", w)
	}
}

func TestSync_ErrosDoProtocolo(t *testing.T) {
	casos := []struct {
		nome   string
		r      respostaFake
		espera time.Duration
	}{
		{"401", respostaFake{status: 401, corpo: `{"erro":"AGENTE_NAO_AUTENTICADO"}`}, 10 * time.Minute},
		{"404", respostaFake{status: 404, corpo: `{"erro":"SEM_INSTALACAO"}`}, 6 * time.Hour},
		{"400", respostaFake{status: 400, corpo: `{"erro":"JSON_INVALIDO"}`}, 5 * time.Minute},
		{"422", respostaFake{status: 422, corpo: `{"erro":"CORPO_INVALIDO"}`}, 5 * time.Minute},
		{"413", respostaFake{status: 413, corpo: `{"erro":"CORPO_GRANDE"}`}, 5 * time.Minute},
		{"429 segundos", respostaFake{status: 429, corpo: `{"erro":"LIMITE"}`, hdr: http.Header{"Retry-After": {"120"}}}, 120 * time.Second},
		{"429 sem header", respostaFake{status: 429, corpo: `{"erro":"LIMITE"}`}, 60 * time.Minute},
		{"403", respostaFake{status: 403, corpo: `{"erro":"INSTALACAO_BLOQUEADA"}`}, 60 * time.Second},
	}
	for _, c := range casos {
		m, a := novoMundo(t, true)
		m.padrao = c.r
		if w := a.ciclo(); w != c.espera {
			t.Errorf("%s: espera %v, esperado %v", c.nome, w, c.espera)
		}
		if len(m.pedidos) != 1 {
			t.Errorf("%s: sem retentativa imediata (%d pedidos)", c.nome, len(m.pedidos))
		}
		if _, err := a.arq.lerDoc(); err == nil {
			t.Errorf("%s: nada pode ser gravado em erro", c.nome)
		}
	}
}

func TestSync_404ParaOCicloDeLicenca(t *testing.T) {
	m, a := novoMundo(t, true)
	m.padrao = respostaFake{status: 404, corpo: `{"erro":"SEM_INSTALACAO"}`}
	a.ciclo()
	for i := 0; i < 5; i++ {
		m.agora = m.agora.Add(time.Hour)
		a.ciclo()
	}
	if len(m.pedidos) != 1 {
		t.Fatalf("depois do 404 o ciclo para (só sonda a cada 6 h): %d pedidos", len(m.pedidos))
	}
	m.agora = m.agora.Add(2 * time.Hour)
	m.padrao = respostaFake{status: 200, corpo: respOK(vetorEnvelope(), "stable", nil, nil)}
	a.ciclo()
	if len(m.pedidos) != 2 || carregaEstadoHermes(a.caminhoEstado).SemInstalacao {
		t.Fatal("após 6 h sonda de novo e, voltando a instalação, retoma")
	}
}

func TestSync_EventosSoSaemDaFilaQuandoOServidorGrava(t *testing.T) {
	m, a := novoMundo(t, true)
	m.upd.eventos = []EventoHermes{{Tipo: "hermes_update_ok", Mensagem: "ok"}}
	m.padrao = respostaFake{err: errors.New("rede")}
	a.ciclo()
	m.agora = m.agora.Add(61 * time.Second)
	m.padrao = respostaFake{status: 200, corpo: respOK(vetorEnvelope(), "stable", nil, nil)}
	a.ciclo()
	if !strings.Contains(string(m.pedidos[1].corpo), "hermes_update_ok") {
		t.Fatal("evento perdido após falha de rede")
	}
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if strings.Contains(string(m.pedidos[2].corpo), "hermes_update_ok") {
		t.Fatal("evento entregue não pode ser reenviado")
	}
	// 422: descarta (pode ser o evento que tornou o corpo inválido)
	injetaEvento(t, a, EventoHermes{Tipo: "hermes_relogio", Mensagem: "x"})
	m.padrao = respostaFake{status: 422, corpo: `{"erro":"CORPO_INVALIDO"}`}
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if len(carregaEstadoHermes(a.caminhoEstado).Eventos) != 0 {
		t.Fatal("422 deveria descartar os eventos")
	}
}

// injetaEvento põe um evento na fila persistida (como se viesse de um ciclo anterior).
func injetaEvento(t *testing.T, a *agenteHermes, ev EventoHermes) {
	t.Helper()
	e := carregaEstadoHermes(a.caminhoEstado)
	enfileiraEvento(e, ev)
	if err := salvaEstadoHermes(a.caminhoEstado, e); err != nil {
		t.Fatal(err)
	}
}

func TestSync_DigestAlvoDisparaUpdateUmaVez(t *testing.T) {
	m, a := novoMundo(t, true)
	outro := "sha256:" + strings.Repeat("e", 64)
	m.padrao = respostaFake{status: 200, corpo: respOK(vetorEnvelope(), "preview", &outro, nil)}
	a.ciclo()
	if len(m.upd.disparos) != 1 || m.upd.disparos[0] != "preview "+outro {
		t.Fatalf("digest_alvo diferente do em uso deveria disparar 1 update: %v", m.upd.disparos)
	}
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if len(m.upd.disparos) != 1 {
		t.Fatal("o mesmo alvo não é redisparado a cada ciclo")
	}
	m.agora = m.agora.Add(61 * time.Minute)
	a.ciclo()
	if len(m.upd.disparos) != 2 {
		t.Fatal("depois de 1 h sem chegar ao alvo, tenta de novo")
	}
	// alvo igual ao em uso, nulo ou inválido: nada
	for _, d := range []*string{&m.info.Digest, nil, ptr("sha256:xyz")} {
		m2, a2 := novoMundo(t, true)
		m2.padrao = respostaFake{status: 200, corpo: respOK(vetorEnvelope(), "preview", d, nil)}
		a2.ciclo()
		if len(m2.upd.disparos) != 0 {
			t.Fatalf("alvo %v não deveria disparar", d)
		}
	}
}

func ptr(s string) *string { return &s }

func TestSync_AgenteAlvoReusaAutoUpdate(t *testing.T) {
	m, a := novoMundo(t, true)
	m.padrao = respostaFake{status: 200, corpo: respOK(vetorEnvelope(), "stable", nil, ptr("0.9.0"))}
	a.ciclo()
	if len(m.alvos) != 1 || m.alvos[0] != "0.9.0" {
		t.Fatalf("agente_alvo deveria chamar o auto-update existente: %v", m.alvos)
	}
	// o documento foi aplicado ANTES do update (que reinicia o processo)
	if _, err := a.arq.lerDoc(); err != nil {
		t.Fatal("documento deveria estar gravado antes do auto-update")
	}
	// falhou: não baixa de novo a cada ciclo
	m.falhaAlv = errors.New("sha256 não confere")
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if len(m.alvos) != 2 {
		t.Fatalf("após falha, espera antes de tentar a mesma versão: %v", m.alvos)
	}
	// versão igual à instalada: nada
	m3, a3 := novoMundo(t, true)
	m3.padrao = respostaFake{status: 200, corpo: respOK(vetorEnvelope(), "stable", nil, ptr(versao))}
	a3.ciclo()
	if len(m3.alvos) != 0 {
		t.Fatal("mesma versão não atualiza")
	}
	// com o hermes-imagem rodando, não reinicia o agente
	m4, a4 := novoMundo(t, true)
	m4.upd.rodando = true
	m4.padrao = respostaFake{status: 200, corpo: respOK(vetorEnvelope(), "stable", nil, ptr("0.9.0"))}
	a4.ciclo()
	if len(m4.alvos) != 0 {
		t.Fatal("não atualiza o agente durante o hermes_update")
	}
	// servidor adotado (Credit + Hermes): quem atualiza o agente é o heartbeat do Credit
	m5, a5 := novoMundo(t, false)
	m5.padrao = respostaFake{status: 200, corpo: respOK(vetorEnvelope(), "stable", nil, ptr("0.9.0"))}
	a5.ciclo()
	if len(m5.alvos) != 0 {
		t.Fatal("modo adotado não usa agente_alvo do sync")
	}
}

func TestSync_SoRotasHermes(t *testing.T) {
	m, a := novoMundo(t, true)
	outro := "sha256:" + strings.Repeat("e", 64)
	m.padrao = respostaFake{status: 200, corpo: respOK(vetorEnvelope(), "preview", &outro, ptr("0.9.0"))}
	for i := 0; i < 3; i++ {
		a.ciclo()
		m.agora = m.agora.Add(61 * time.Second)
	}
	_, _, _ = a.credencial()
	for _, p := range m.pedidos {
		if !strings.HasPrefix(p.url, "https://rv.teste/api/agente/hermes") {
			t.Fatalf("modo Hermes chamou rota fora do Hermes: %s", p.url)
		}
	}
}

// ── credencial ──

func TestCredencial_PedidoExatoERespostas(t *testing.T) {
	m, a := novoMundo(t, true)
	m.padrao = respostaFake{status: 200, corpo: `{"repositorio":"ghcr.io/rvland-devs/hermes","registro":"ghcr.io","usuario":"rv-maquina","senha":"ghs_ABC123.x-y","expira_em":"2026-11-23T13:00:00.000Z"}`}
	u, s, err := a.credencial()
	if err != nil || u != "rv-maquina" || s != "ghs_ABC123.x-y" {
		t.Fatalf("credencial: %q %q %v", u, "***", err)
	}
	p := m.pedidos[0]
	if p.url != "https://rv.teste/api/agente/hermes/credencial" || string(p.corpo) != `{"pedido":"credencial"}` {
		t.Fatalf("pedido: %s %s", p.url, p.corpo)
	}
	// a credencial não usa nem avança o timestamp do sync (sem anti-replay no servidor)
	if carregaEstadoHermes(a.caminhoEstado).UltimoTsMs != 0 {
		t.Fatal("credencial não pode mexer no estado do sync")
	}

	casos := []struct {
		r   respostaFake
		err error
	}{
		{respostaFake{status: 403, corpo: `{"erro":"INSTALACAO_BLOQUEADA"}`}, errCredencialBloqueada},
		{respostaFake{status: 429, corpo: `{"erro":"LIMITE"}`, hdr: http.Header{"Retry-After": {"3600"}}}, errCredencialLimite},
		{respostaFake{status: 503, corpo: `{"erro":"INDISPONIVEL"}`}, nil},
		{respostaFake{status: 200, corpo: `{"usuario":"a b","senha":"x"}`}, nil},
		{respostaFake{status: 200, corpo: `{"usuario":"a","senha":"x;rm -rf"}`}, nil},
		{respostaFake{status: 200, corpo: `{"usuario":"a","senha":""}`}, nil},
	}
	for _, c := range casos {
		m, a := novoMundo(t, true)
		m.padrao = c.r
		_, s, err := a.credencial()
		if err == nil || (c.err != nil && !errors.Is(err, c.err)) {
			t.Errorf("%d %s: erro esperado (%v), veio %v", c.r.status, c.r.corpo, c.err, err)
		}
		if s != "" {
			t.Errorf("%d: senha não pode vazar em erro", c.r.status)
		}
		if err != nil && strings.Contains(err.Error(), "x;rm") {
			t.Error("erro não pode citar a senha recebida")
		}
	}
	// RELOGIO: retenta uma vez com o relógio do servidor
	m2, a2 := novoMundo(t, true)
	m2.fila = []respostaFake{{status: 409, corpo: `{"erro":"RELOGIO","agora":"` + formatoTs(m2.agora.Add(time.Hour)) + `"}`}}
	m2.padrao = respostaFake{status: 200, corpo: `{"usuario":"u","senha":"s"}`}
	if _, _, err := a2.credencial(); err != nil || len(m2.pedidos) != 2 {
		t.Fatalf("RELOGIO na credencial deveria retentar: %v (%d)", err, len(m2.pedidos))
	}
	if ts := tempo(t, m2.pedidos[1].headers["X-RVLand-Timestamp"]); ts.Sub(m2.agora.Add(time.Hour)).Abs() > time.Second {
		t.Fatalf("retentativa com relógio corrigido: %v", ts)
	}
}

func TestCredencial_SaidaDoSubcomandoSoDuasLinhas(t *testing.T) {
	m, a := novoMundo(t, true)
	m.padrao = respostaFake{status: 200, corpo: `{"usuario":"u-1","senha":"s.2"}`}
	var out strings.Builder
	if rc := escreveCredencial(a, &out, &strings.Builder{}); rc != 0 || out.String() != "u-1\ns.2\n" {
		t.Fatalf("saída do `agenterv hermes credencial` (lida pelo hook do hermes-imagem): rc=%d %q", rc, out.String())
	}
	m.padrao = respostaFake{status: 403, corpo: `{"erro":"INSTALACAO_BLOQUEADA"}`}
	var out2, errb strings.Builder
	if rc := escreveCredencial(a, &out2, &errb); rc != 3 || out2.Len() != 0 {
		t.Fatalf("403: rc=%d stdout=%q", rc, out2.String())
	}
}

// ── seleção do modo: Credit/Pic Price inalterado sem configuração Hermes ──

func TestModo_CreditInalteradoSemHermes(t *testing.T) {
	cfg := &Config{Enderecos: []string{"x"}, ServidorID: "s", Driver: "systemd"}
	credit, hermes, exclusivo := planoExecucao(cfg)
	if !credit || hermes || exclusivo {
		t.Fatalf("sem modo Hermes: só Credit (credit=%v hermes=%v exclusivo=%v)", credit, hermes, exclusivo)
	}
	b, _ := json.Marshal(cfg)
	if strings.Contains(string(b), "modo") || strings.Contains(string(b), "hermes") {
		t.Fatalf("config do Credit não ganha campos novos: %s", b)
	}
	// config antiga (sem os campos) continua lida igual
	var c2 Config
	_ = json.Unmarshal([]byte(`{"enderecos":["x"],"servidor_id":"s","driver":"dry","picprice_porta":7711}`), &c2)
	if credit, hermes, _ := planoExecucao(&c2); !credit || hermes {
		t.Fatal("config antiga deveria seguir só no Credit")
	}

	// exclusivo (servidor criado por chave): só Hermes
	cfg.Modo, cfg.Hermes = "hermes", &ConfigHermes{InstalacaoID: "i"}
	if credit, hermes, exclusivo := planoExecucao(cfg); credit || !hermes || !exclusivo {
		t.Fatal("modo hermes: sem heartbeat/Pic Price, só sync")
	}
	// adotado (servidor do Credit com instalação Hermes): os dois
	cfg.Modo = ""
	if credit, hermes, exclusivo := planoExecucao(cfg); !credit || !hermes || exclusivo {
		t.Fatal("adotado: Credit como sempre + sync Hermes")
	}
	// modo desconhecido nunca desliga o Credit
	cfg.Modo, cfg.Hermes = "outro", nil
	if credit, _, _ := planoExecucao(cfg); !credit {
		t.Fatal("modo desconhecido não pode desligar o Credit")
	}
}

func TestConfigHermes_Padroes(t *testing.T) {
	h := (&Config{Modo: "hermes"}).hermesResolvida()
	if h.DirHermes != "/var/lib/hermes" || h.DirLicenca != "/var/lib/hermes/licenca" || h.HermesImagem != "/usr/local/bin/hermes-imagem" || h.Container != "hermes" {
		t.Fatalf("padrões: %+v", h)
	}
	h = (&Config{Hermes: &ConfigHermes{DirHermes: "/x"}}).hermesResolvida()
	if h.DirLicenca != "/x/licenca" {
		t.Fatalf("dir_licenca segue dir_hermes: %+v", h)
	}
}

func TestConfigHermes_ConfigurarPelaCLI(t *testing.T) {
	cfg := &Config{Enderecos: []string{"x"}, ServidorID: "s", Driver: "systemd"}
	// adoção: servidor do Credit ganha o bloco Hermes e CONTINUA no Credit
	if err := configurarHermes(cfg, []string{"--instalacao=inst-1", "--canal=preview"}); err != nil {
		t.Fatal(err)
	}
	if cfg.Modo != "" || cfg.Hermes == nil || cfg.Hermes.InstalacaoID != "inst-1" || cfg.Hermes.Canal != "preview" {
		t.Fatalf("adoção: %+v %+v", cfg, cfg.Hermes)
	}
	if credit, hermes, _ := planoExecucao(cfg); !credit || !hermes {
		t.Fatal("adotado: Credit + Hermes")
	}
	// exclusivo só quando pedido
	if err := configurarHermes(cfg, []string{"--modo=hermes"}); err != nil || cfg.Modo != "hermes" || cfg.Hermes.InstalacaoID != "inst-1" {
		t.Fatalf("modo hermes: %v %+v", err, cfg)
	}
	for _, ruim := range [][]string{{"--canal=latest"}, {"--modo=credit"}, {"--instalacao=a b"}} {
		if err := configurarHermes(&Config{}, ruim); err == nil {
			t.Errorf("%v deveria ser recusado", ruim)
		}
	}
}

// Transporte HTTP real (postHermes) contra um servidor de teste: headers, Content-Type e
// assinatura sobre os bytes exatamente como foram no fio.
func TestSync_TransporteHTTPReal(t *testing.T) {
	m, a := novoMundo(t, true)
	var recebido []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recebido, _ = io.ReadAll(r.Body)
		if r.Method != http.MethodPost || r.URL.Path != "/api/agente/hermes" || r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("pedido: %s %s %s", r.Method, r.URL.Path, r.Header.Get("Content-Type"))
		}
		ts := r.Header.Get("X-RVLand-Timestamp")
		if !verificaComPub(mensagemHermes("sync", ts, recebido), r.Header.Get("X-RVLand-Assinatura"), m.pub) {
			w.WriteHeader(401)
			_, _ = w.Write([]byte(`{"erro":"AGENTE_NAO_AUTENTICADO"}`))
			return
		}
		_, _ = w.Write([]byte(strings.ReplaceAll(respOK(vetorEnvelope(), "stable", nil, nil), "__AGORA__", vetorAgora)))
	}))
	defer srv.Close()
	a.cfg.Enderecos = []string{srv.URL}
	a.post = postHermes
	if w := a.ciclo(); w != 60*time.Second {
		t.Fatalf("espera %v", w)
	}
	if b, err := a.arq.lerDoc(); err != nil || string(b) != string(vetorEnvelope()) {
		t.Fatalf("documento não gravado pelo caminho HTTP real: %v", err)
	}
	if len(recebido) == 0 {
		t.Fatal("servidor não recebeu corpo")
	}
}

// Se o processo cair DURANTE o envio, o timestamp já está no disco: o próximo processo nunca
// reenvia uma requisição assinada com o mesmo timestamp.
func TestSync_TimestampNoDiscoAntesDoEnvio(t *testing.T) {
	m, a := novoMundo(t, true)
	conferidos := 0
	a.post = func(url string, corpo []byte, h map[string]string) (int, []byte, http.Header, error) {
		ts := tempo(t, h["X-RVLand-Timestamp"])
		if got := carregaEstadoHermes(a.caminhoEstado).UltimoTsMs; got != ts.UnixMilli() {
			t.Errorf("no envio, o disco tem %d e o pedido %d", got, ts.UnixMilli())
		}
		conferidos++
		return m.post(url, corpo, h)
	}
	a.ciclo()
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if conferidos != 2 {
		t.Fatalf("esperado 2 envios conferidos, %d", conferidos)
	}
}
