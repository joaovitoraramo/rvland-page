package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

// Testes da revisão Opus (1 ALTO + 4 MÉDIOS + BAIXOS).

// avaliarComoContainer: equivalente Go de `avaliar` do licenca/nucleo.mjs, lendo o que o agente
// deixou no disco, com o relógio do HOST e o HERMES_INSTALACAO_ID do container.
func avaliarComoContainer(t *testing.T, arq arquivosHermes, agoraHost time.Time, instalacaoEnv string) string {
	t.Helper()
	marcador := arq.existe(marcadorObrigatoria)
	texto, err := arq.lerDoc()
	if err != nil {
		if marcador {
			return "recusar"
		}
		return "liberar"
	}
	d, err := verificarDocHermes(texto, opcoesDoc{chaves: map[string]string{"h1": vetorPubB64}, agora: agoraHost, instalacaoID: instalacaoEnv})
	if err != nil {
		if marcador {
			return "recusar"
		}
		return "liberar"
	}
	if bloquear, _ := decisaoHermes(d, agoraHost); bloquear && marcador {
		return "recusar"
	}
	return "liberar"
}

func corpo200(licenca []byte, agora time.Time) string {
	return strings.Replace(respOK(licenca, "stable", nil, nil), "__AGORA__", formatoTs(agora), 1)
}

func eventosDoEstado(a *agenteHermes) string {
	b, _ := json.Marshal(carregaEstadoHermes(a.caminhoEstado).Eventos)
	return string(b)
}

// ── ALTO: relógio do host (o do container) ──

func TestRevisao_HostAtrasadoNaoGravaNemArma(t *testing.T) {
	m, a := novoMundo(t, true)
	host := m.agora                        // 12:00 no host
	servidor := host.Add(15 * time.Minute) // 12:15 no RV
	futuro := docVariante(t, func(p map[string]any) { p["emitido_em"] = formatoTs(host.Add(12 * time.Minute)) })
	m.padrao = respostaFake{status: 200, corpo: corpo200(futuro, servidor)}
	a.ciclo()
	if _, err := a.arq.lerDoc(); err == nil {
		t.Fatal("documento 'emitido no futuro' para o host não pode ser gravado (o container o recusaria)")
	}
	if m.existe(a, marcadorObrigatoria) || m.existe(a, marcadorBloqueio) {
		t.Fatal("nada pode ser armado com o host atrasado")
	}
	if ev := eventosDoEstado(a); !strings.Contains(ev, `"hermes_relogio"`) || !strings.Contains(ev, `"critico"`) {
		t.Fatalf("esperado evento hermes_relogio crítico: %s", ev)
	}
	if d := avaliarComoContainer(t, a.arq, host, ""); d != "liberar" {
		t.Fatalf("o container recusaria o estado deixado pelo agente: %s", d)
	}
}

func TestRevisao_HostAtrasadoMantemDocumentoAntigoValido(t *testing.T) {
	m, a := novoMundo(t, true)
	a.ciclo() // documento do vetor (emitido 20/11) gravado e obrigatoria armada
	original, _ := a.arq.lerDoc()
	if !m.existe(a, marcadorObrigatoria) {
		t.Fatal("pré-condição: obrigatoria")
	}
	m.agora = m.agora.Add(61 * time.Second)
	futuro := docVariante(t, func(p map[string]any) { p["emitido_em"] = formatoTs(m.agora.Add(12 * time.Minute)) })
	m.padrao = respostaFake{status: 200, corpo: corpo200(futuro, m.agora.Add(15*time.Minute))}
	a.ciclo()
	if atual, _ := a.arq.lerDoc(); string(atual) != string(original) {
		t.Fatal("não pode substituir o documento que o container aceita")
	}
	// política da re-revisão: documento autêntico e mais novo que não pode ser entregue ao
	// container = desarma (remove obrigatoria), nunca arma
	if m.existe(a, marcadorObrigatoria) {
		t.Fatal("documento novo não entregável: obrigatoria deve ser removida")
	}
	if d := avaliarComoContainer(t, a.arq, m.agora, ""); d != "liberar" {
		t.Fatalf("container recusaria: %s", d)
	}
}

func TestRevisao_InstalacaoDoContainerDiferenteNaoArma(t *testing.T) {
	m, a := novoMundo(t, true)
	m.info.InstalacaoEnv = "inst-outra"
	a.ciclo()
	if _, err := a.arq.lerDoc(); err == nil || m.existe(a, marcadorObrigatoria) {
		t.Fatal("HERMES_INSTALACAO_ID do container diferente: o container recusaria; nada gravado nem armado")
	}
	if d := avaliarComoContainer(t, a.arq, m.agora, "inst-outra"); d != "liberar" {
		t.Fatalf("container recusaria: %s", d)
	}
	// igual ao da instalação: normal
	m2, a2 := novoMundo(t, true)
	m2.info.InstalacaoEnv = vetorInstalacao
	a2.ciclo()
	if !m2.existe(a2, marcadorObrigatoria) || avaliarComoContainer(t, a2.arq, m2.agora, vetorInstalacao) != "liberar" {
		t.Fatal("instalação igual deveria armar e o container aceitar")
	}
}

// ── MÉDIO 3: fingerprint da chave h1 da imagem ──

func TestRevisao_FingerprintDaChave(t *testing.T) {
	raw, _ := base64.StdEncoding.DecodeString(vetorPubB64)
	h := sha256.Sum256(raw)
	if fpChaveHermes(vetorPubB64) != hex.EncodeToString(h[:]) {
		t.Fatal("fp = sha256 hex minúsculo dos 32 bytes crus da chave")
	}
	spki := base64.StdEncoding.EncodeToString(append(append([]byte{}, spkiEd25519...), raw...))
	if fpChaveHermes(spki) != fpChaveHermes(vetorPubB64) {
		t.Fatal("SPKI e crua têm o mesmo fp (formato canônico = 32 bytes crus)")
	}
	if fpChaveHermes("") != "" || fpChaveHermes("PLACEHOLDER") != "" {
		t.Fatal("chave inválida não tem fp")
	}
}

func TestRevisao_ObrigatoriaExigeFingerprintIgual(t *testing.T) {
	for _, fp := range []string{"", strings.Repeat("0", 64)} {
		m, a := novoMundo(t, true)
		m.info.LicencaChaveFP = fp
		a.ciclo()
		if m.existe(a, marcadorObrigatoria) {
			t.Fatalf("fp %q: não pode armar obrigatoria", fp)
		}
		// fp ausente (imagem antiga): o documento é entregue; fp diferente: o container não o
		// verificaria (outra chave), então não é entregue
		if _, err := a.arq.lerDoc(); (err == nil) != (fp == "") {
			t.Fatalf("fp %q: entrega do documento errada (%v)", fp, err)
		}
	}
	// já armada: fp AUSENTE (imagem antiga, sem o label) não derruba
	m, a := novoMundo(t, true)
	a.ciclo()
	m.info.LicencaChaveFP = ""
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if !m.existe(a, marcadorObrigatoria) {
		t.Fatal("fp ausente não derruba o marcador existente")
	}
	// fp PRESENTE e diferente: o container não verifica nada que o agente aceita => remove
	m.info.LicencaChaveFP = strings.Repeat("0", 64)
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if m.existe(a, marcadorObrigatoria) {
		t.Fatal("fp diferente deve remover obrigatoria")
	}
	if !strings.Contains(eventosDoEstado(a), "hermes_adulteracao") {
		t.Fatalf("remoção por chave diferente deve gerar evento: %s", eventosDoEstado(a))
	}
}

// ── MÉDIO 4 / M13: falha ao gravar o documento não arma; ordem documento -> marcador ──

func TestRevisao_FalhaAoGravarDocNaoArma(t *testing.T) {
	m, a := novoMundo(t, true)
	// licenca.json é um diretório: o rename falha, mas o marcador poderia ser criado
	if err := os.MkdirAll(filepath.Join(a.arq.dirLicenca, nomeDocHermes, "x"), 0o755); err != nil {
		t.Fatal(err)
	}
	a.ciclo()
	if m.existe(a, marcadorObrigatoria) {
		t.Fatal("documento não gravado => obrigatoria não pode ser criada")
	}
}

func TestRevisao_OrdemDocumentoAntesDoMarcador(t *testing.T) {
	m, a := novoMundo(t, true)
	vistos := 0
	a.arq.antesMarcador = func(nome string, existir bool) {
		if nome == marcadorObrigatoria && existir {
			vistos++
			if _, err := a.arq.lerDoc(); err != nil {
				t.Error("obrigatoria criada antes do licenca.json")
			}
		}
	}
	a.ciclo()
	if vistos != 1 || !m.existe(a, marcadorObrigatoria) {
		t.Fatalf("marcador deveria ter sido criado uma vez (%d)", vistos)
	}
}

// ── M16b + BAIXO piso: RELOGIO sem loop e sem regredir abaixo do último aceito ──

// servidorJanela simula o RV: RELOGIO fora de ±5 min, REPLAY se <= último aceito, 200 senão.
type servidorJanela struct {
	m      *mundoHermes
	agora  func() time.Time
	aceito time.Time
	status []int
	mu     sync.Mutex
}

func (s *servidorJanela) post(url string, corpo []byte, h map[string]string) (int, []byte, http.Header, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	agora := s.agora()
	ts, _ := time.Parse(time.RFC3339Nano, h["X-RVLand-Timestamp"])
	st, resp := 200, corpo200(vetorEnvelope(), agora)
	switch {
	case ts.Sub(agora).Abs() > 5*time.Minute:
		st, resp = 409, `{"erro":"RELOGIO","agora":"`+formatoTs(agora)+`"}`
	case !ts.After(s.aceito):
		st, resp = 409, `{"erro":"REPLAY"}`
	default:
		s.aceito = ts
	}
	s.status = append(s.status, st)
	return st, []byte(resp), http.Header{}, nil
}

func TestRevisao_RelogioAdiantadoUmDiaSemLoop(t *testing.T) {
	m, a := novoMundo(t, true)
	srvAgora := m.agora
	m.agora = m.agora.Add(24 * time.Hour) // relógio do host 1 dia adiantado
	s := &servidorJanela{m: m, agora: func() time.Time { return srvAgora }}
	a.post = s.post
	for i := 0; i < 3; i++ {
		a.ciclo()
		srvAgora = srvAgora.Add(61 * time.Second)
		m.agora = m.agora.Add(61 * time.Second)
	}
	want := []int{409, 200, 200, 200}
	if len(s.status) != len(want) {
		t.Fatalf("respostas %v, esperado %v (RELOGIO só uma vez, sem loop)", s.status, want)
	}
	for i := range want {
		if s.status[i] != want[i] {
			t.Fatalf("respostas %v, esperado %v", s.status, want)
		}
	}
}

func TestRevisao_PisoNuncaAbaixoDoUltimoAceito(t *testing.T) {
	m, a := novoMundo(t, true)
	srvAgora := m.agora.Add(-4 * time.Minute) // host 4 min adiantado: ainda aceito
	s := &servidorJanela{m: m, agora: func() time.Time { return srvAgora }}
	a.post = s.post
	a.ciclo() // 200 com ts = host (4 min à frente do RV)
	// o host salta mais 1 h
	srvAgora = srvAgora.Add(61 * time.Second)
	m.agora = m.agora.Add(time.Hour + 61*time.Second)
	a.ciclo()
	if len(s.status) != 3 || s.status[1] != 409 || s.status[2] != 200 {
		t.Fatalf("após RELOGIO a retentativa não pode cair abaixo do último aceito (REPLAY): %v", s.status)
	}
	if carregaEstadoHermes(a.caminhoEstado).UltimoAceitoMs == 0 {
		t.Fatal("último aceito deveria ser persistido")
	}
}

// ── BAIXOS do ciclo ──

func TestRevisao_404SoComSemInstalacaoEComTeto(t *testing.T) {
	m, a := novoMundo(t, true)
	m.padrao = respostaFake{status: 404, corpo: `<html>Not Found</html>`}
	if w := a.ciclo(); w != 60*time.Second {
		t.Fatalf("404 sem SEM_INSTALACAO é transitório: %v", w)
	}
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if len(m.pedidos) != 2 || carregaEstadoHermes(a.caminhoEstado).SemInstalacao {
		t.Fatal("404 transitório não para o ciclo")
	}
	// relógio voltou: a espera do 404 nunca passa de 6 h
	e := carregaEstadoHermes(a.caminhoEstado)
	e.SemInstalacao, e.ProximaMs = true, m.agora.Add(72*time.Hour).UnixMilli()
	_ = salvaEstadoHermes(a.caminhoEstado, e)
	if w := a.ciclo(); w <= 0 || w > espera404Hermes {
		t.Fatalf("espera do 404 sem teto: %v", w)
	}
}

func TestRevisao_EmitidoNaoRegrideMesmoSemArquivo(t *testing.T) {
	m, a := novoMundo(t, true)
	novo := docVariante(t, func(p map[string]any) { p["emitido_em"] = "2026-11-23T11:30:00.000Z" })
	m.padrao = respostaFake{status: 200, corpo: corpo200(novo, m.agora)}
	a.ciclo()
	_ = os.Remove(filepath.Join(a.arq.dirLicenca, nomeDocHermes))
	m.agora = m.agora.Add(61 * time.Second)
	m.padrao = respostaFake{status: 200, corpo: respOK(vetorEnvelope(), "stable", nil, nil)} // emitido 20/11
	a.ciclo()
	if _, err := a.arq.lerDoc(); err == nil {
		t.Fatal("apagar o licenca.json não pode fazer o agente aceitar documento mais antigo")
	}
}

func TestRevisao_EnvelopeComChavesExatas(t *testing.T) {
	casos := map[string]string{
		"maiúsculas":   `{"PAYLOAD":"` + vetorPayload + `","ASSINATURA":"` + vetorAssinatura + `","KID":"h1"}`,
		"misto":        `{"Payload":"` + vetorPayload + `","assinatura":"` + vetorAssinatura + `","kid":"h1"}`,
		"duplicada":    `{"payload":"` + vetorPayload + `","assinatura":"` + vetorAssinatura + `","kid":"h2","kid":"h1"}`,
		"desconhecida": `{"payload":"` + vetorPayload + `","assinatura":"` + vetorAssinatura + `","kid":"h1","extra":1}`,
	}
	for nome, c := range casos {
		if _, err := verificarDocHermes([]byte(c), opVetor(t)); err == nil {
			t.Errorf("%s: deveria ser recusado", nome)
		}
	}
	if _, err := verificarDocHermes(vetorEnvelope(), opVetor(t)); err != nil {
		t.Fatal(err)
	}
}

func TestRevisao_ConfigCreditGolden(t *testing.T) {
	cfg := &Config{Enderecos: []string{"https://rvland.com.br"}, ServidorID: "s-1", Driver: "systemd", PicpricePorta: 7711, SeedB64: "NAO-VAI"}
	b, _ := json.MarshalIndent(cfg, "", "  ")
	want := "{\n  \"enderecos\": [\n    \"https://rvland.com.br\"\n  ],\n  \"servidor_id\": \"s-1\",\n  \"driver\": \"systemd\",\n  \"picprice_porta\": 7711\n}"
	if string(b) != want {
		t.Fatalf("config do Credit mudou:\n%s", b)
	}
	cfg.Modo, cfg.Hermes = "hermes", &ConfigHermes{InstalacaoID: "i-1", Canal: "preview"}
	b, _ = json.MarshalIndent(cfg, "", "  ")
	want = "{\n  \"enderecos\": [\n    \"https://rvland.com.br\"\n  ],\n  \"servidor_id\": \"s-1\",\n  \"driver\": \"systemd\",\n  \"picprice_porta\": 7711,\n  \"modo\": \"hermes\",\n  \"hermes\": {\n    \"instalacao_id\": \"i-1\",\n    \"canal\": \"preview\"\n  }\n}"
	if string(b) != want {
		t.Fatalf("config Hermes:\n%s", b)
	}
}

// ── Docker: inspect sem truncar, env/label novos ──

func TestRevisao_InspectLeEnvEFingerprint(t *testing.T) {
	insp := strings.Replace(inspectRodando, `"Env":["PATH=/usr/bin","GIT_SHA=f982d5a"]`,
		`"Env":["PATH=/usr/bin","GIT_SHA=f982d5a","HERMES_INSTALACAO_ID= inst-9 "]`, 1)
	insp = strings.Replace(insp, `"org.aramo.hermes.licenca-chave":"real"`,
		`"org.aramo.hermes.licenca-chave":"real","org.aramo.hermes.licenca-chave-fp":"`+strings.Repeat("a", 64)+`"`, 1)
	f := &fakeExec{respostas: map[string]respFake{
		"docker inspect --type container hermes":      {out: insp},
		"docker version --format {{.Server.Version}}": {out: "29"},
	}}
	i := driverTeste(t, f).Observar(context.Background())
	if i.InstalacaoEnv != "inst-9" || i.LicencaChaveFP != strings.Repeat("a", 64) {
		t.Fatalf("env/label: %+v", i)
	}
}

func TestRevisao_ExecNaoTruncaStdout(t *testing.T) {
	e := executorProcesso{maxSaida: 8 << 20, graca: time.Second}
	out, _, err := e.exec(context.Background(), "sh", "-c", "head -c 200000 /dev/zero | tr '\\0' a")
	if err != nil || len(out) != 200000 {
		t.Fatalf("stdout do inspect não pode ser truncado: %d %v", len(out), err)
	}
	e.maxSaida = 1000
	if _, _, err := e.exec(context.Background(), "sh", "-c", "head -c 5000 /dev/zero"); err == nil {
		t.Fatal("acima do teto deveria dar erro (nunca JSON cortado)")
	}
}

// ── MÉDIO 1: saída do hermes-imagem em arquivo (sem pipe) ──

func TestRevisao_UpdateSaidaEmArquivoSemPipe(t *testing.T) {
	dir := t.TempDir()
	e := executorProcesso{arquivo: true, dirTemp: dir, graca: time.Second}
	out, _, err := e.exec(context.Background(), "sh", "-c", `if [ -p /dev/stdout ]; then echo PIPE; else echo ARQUIVO; fi; echo erro >&2`)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(out), "ARQUIVO") || strings.Contains(string(out), "PIPE") || !strings.Contains(string(out), "erro") {
		t.Fatalf("stdout/stderr deveriam ir para arquivo: %q", out)
	}
	if ents, _ := os.ReadDir(dir); len(ents) != 0 {
		t.Fatal("arquivo temporário deveria ser apagado")
	}
}

// ── MÉDIO 2 / M23: timeout = SIGTERM no grupo, depois SIGKILL no grupo ──

func vivo(pid int) bool { return syscall.Kill(pid, 0) == nil }

func esperaMorrer(t *testing.T, pid int) bool {
	t.Helper()
	for i := 0; i < 200; i++ {
		if !vivo(pid) {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return false
}

func lerPid(t *testing.T, p string) int {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	var n int
	for _, c := range strings.TrimSpace(string(b)) {
		n = n*10 + int(c-'0')
	}
	return n
}

func TestRevisao_TimeoutTermAntesDeKillNoGrupo(t *testing.T) {
	dir := t.TempDir()
	var mu sync.Mutex
	var sinais []syscall.Signal
	e := executorProcesso{arquivo: true, dirTemp: dir, graca: 2 * time.Second,
		observa: func(s syscall.Signal) {
			mu.Lock()
			sinais = append(sinais, s)
			mu.Unlock()
		}}
	trap, pidf := filepath.Join(dir, "trap"), filepath.Join(dir, "pid")
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	_, _, err := e.exec(ctx, "sh", "-c", `trap 'echo limpou > "$0"; exit 143' TERM; sleep 30 & echo $! > "$1"; wait`, trap, pidf)
	if err == nil {
		t.Fatal("timeout deveria dar erro")
	}
	mu.Lock()
	primeiro := sinais
	mu.Unlock()
	if len(primeiro) == 0 || primeiro[0] != syscall.SIGTERM {
		t.Fatalf("primeiro sinal deveria ser SIGTERM: %v", primeiro)
	}
	if b, _ := os.ReadFile(trap); strings.TrimSpace(string(b)) != "limpou" {
		t.Fatal("o trap (limpar/logout do hermes-imagem) precisa rodar")
	}
	if !esperaMorrer(t, lerPid(t, pidf)) {
		t.Fatal("o filho (grupo) deveria morrer, não só o líder")
	}
}

func TestRevisao_TimeoutKillNoGrupoQuandoIgnoraTerm(t *testing.T) {
	dir := t.TempDir()
	var mu sync.Mutex
	var sinais []syscall.Signal
	e := executorProcesso{arquivo: true, dirTemp: dir, graca: 300 * time.Millisecond,
		observa: func(s syscall.Signal) {
			mu.Lock()
			sinais = append(sinais, s)
			mu.Unlock()
		}}
	pidf := filepath.Join(dir, "pid")
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	inicio := time.Now()
	_, _, _ = e.exec(ctx, "sh", "-c", `trap '' TERM; sleep 30 & echo $! > "$0"; wait; wait`, pidf)
	if time.Since(inicio) > 5*time.Second {
		t.Fatal("deveria terminar logo após a graça")
	}
	mu.Lock()
	got := append([]syscall.Signal(nil), sinais...)
	mu.Unlock()
	if len(got) < 2 || got[0] != syscall.SIGTERM || got[len(got)-1] != syscall.SIGKILL {
		t.Fatalf("sequência esperada TERM ... KILL: %v", got)
	}
	if !esperaMorrer(t, lerPid(t, pidf)) {
		t.Fatal("SIGKILL deveria atingir o grupo todo")
	}
}

// ── systemd-run --scope com fallback ──

func TestRevisao_ScopeFalhaCaiParaExecucaoDireta(t *testing.T) {
	var chamadas []string
	var mu sync.Mutex
	u := &atualizadorHermes{
		caminho: "/usr/local/bin/hermes-imagem", timeout: time.Minute, usaScope: func() bool { return true },
		exec: func(ctx context.Context, nome string, args ...string) ([]byte, string, error) {
			mu.Lock()
			chamadas = append(chamadas, strings.Join(append([]string{nome}, args...), " "))
			mu.Unlock()
			if nome == "systemd-run" {
				return []byte("Failed to create bus connection: No such file or directory\n"), "", errors.New("exit status 1")
			}
			return []byte("[OK] Hermes atualizado.\n"), "", nil
		},
	}
	u.Disparar("preview", "")
	evs := esperaEventos(t, u)
	if len(chamadas) != 2 || chamadas[1] != "/usr/local/bin/hermes-imagem preview" || evs[0].Tipo != "hermes_update_ok" {
		t.Fatalf("fallback: %v %+v", chamadas, evs)
	}
	// falha do próprio hermes-imagem (dentro do scope) NÃO reexecuta
	chamadas = nil
	u.exec = func(ctx context.Context, nome string, args ...string) ([]byte, string, error) {
		mu.Lock()
		chamadas = append(chamadas, nome)
		mu.Unlock()
		// o hermes-imagem rodou (scope subiu) e a falha dele cita "Failed to connect to bus"
		return []byte("Running scope as unit: run-r1.scope\n[ERRO] docker: Failed to connect to bus.\n"), "", errors.New("exit status 1")
	}
	u.Disparar("preview", "")
	esperaEventos(t, u)
	if len(chamadas) != 1 {
		t.Fatalf("falha do hermes-imagem não pode ser repetida: %v", chamadas)
	}
}

// ── MÉDIO 1: auto-update do Credit adiado durante o update do container ──

func TestRevisao_AutoUpdateCreditAdiadoDuranteHermesUpdate(t *testing.T) {
	var hits int
	var mu sync.Mutex
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		hits++
		mu.Unlock()
		w.WriteHeader(404)
	}))
	defer srv.Close()
	cfg := &Config{Enderecos: []string{srv.URL}}
	defer func() { adiarAutoUpdate = nil }()

	adiarAutoUpdate = func() bool { return true }
	if err := autoAtualiza(cfg, "9.9.9", "1.0.0"); err == nil || hits != 0 {
		t.Fatalf("com hermes-imagem rodando, o auto-update não pode nem baixar (err=%v hits=%d)", err, hits)
	}
	adiarAutoUpdate = func() bool { return false }
	_ = autoAtualiza(cfg, "9.9.9", "1.0.0")
	adiarAutoUpdate = nil
	_ = autoAtualiza(cfg, "9.9.9", "1.0.0")
	if hits != 2 {
		t.Fatalf("sem update do Hermes o Credit segue igual (hits=%d)", hits)
	}
}

func TestRevisao_IniciaHermesRegistraAdiamento(t *testing.T) {
	defer func() { adiarAutoUpdate = nil }()
	a := iniciaHermes(&Config{Enderecos: []string{"x"}, Hermes: &ConfigHermes{}}, false)
	if adiarAutoUpdate == nil || adiarAutoUpdate() {
		t.Fatal("o modo adotado deve registrar o adiamento (falso enquanto nada roda)")
	}
	u := a.upd.(*atualizadorHermes)
	u.mu.Lock()
	u.rodando = true
	u.mu.Unlock()
	if !adiarAutoUpdate() {
		t.Fatal("com o hermes-imagem rodando o auto-update do Credit deve ser adiado")
	}
}

// Estado do agente perdido (reinstalação, hermes.json apagado): o documento do DISCO ainda
// impede aceitar um mais antigo.
func TestRevisao_DocMaisAntigoQueODiscoSemEstado(t *testing.T) {
	m, a := novoMundo(t, true)
	novo := docVariante(t, func(p map[string]any) { p["emitido_em"] = "2026-11-23T11:30:00.000Z" })
	m.padrao = respostaFake{status: 200, corpo: corpo200(novo, m.agora)}
	a.ciclo()
	_ = os.Remove(a.caminhoEstado)
	m.agora = m.agora.Add(61 * time.Second)
	m.padrao = respostaFake{status: 200, corpo: respOK(vetorEnvelope(), "stable", nil, nil)}
	a.ciclo()
	if atual, _ := a.arq.lerDoc(); string(atual) != string(novo) {
		t.Fatal("documento mais antigo que o do disco não pode substituí-lo")
	}
}
