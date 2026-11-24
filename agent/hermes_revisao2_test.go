package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// Testes da re-revisão Opus: estados derivados (S1–S4), checagem local em todo ciclo, fp
// diferente, fallback do scope, TOCTOU do auto-update, piso do timestamp, limpeza do /tmp e trim.

// avaliarComChave: `avaliar` do núcleo com a chave pública da IMAGEM (pode diferir da do agente).
func avaliarComChave(t *testing.T, arq arquivosHermes, agoraHost time.Time, instalacaoEnv, pk string) string {
	t.Helper()
	marcador := arq.existe(marcadorObrigatoria)
	texto, err := arq.lerDoc()
	if err != nil {
		return map[bool]string{true: "recusar", false: "liberar"}[marcador]
	}
	d, err := verificarDocHermes(texto, opcoesDoc{chaves: map[string]string{"h1": pk}, agora: agoraHost, instalacaoID: instalacaoEnv})
	if err != nil {
		return map[bool]string{true: "recusar", false: "liberar"}[marcador]
	}
	if bloquear, _ := decisaoHermes(d, agoraHost); bloquear && marcador {
		return "recusar"
	}
	return "liberar"
}

// nucleoReal roda o `avaliar` do licenca/nucleo.mjs DE VERDADE (node) quando HERMES_NUCLEO_MJS
// aponta para ele; sem a variável (CI do RVLand, que não tem o repo do Hermes) o teste usa só o
// equivalente Go.
func nucleoReal(t *testing.T, arq arquivosHermes, agoraHost time.Time, instalacaoEnv, pk string) (string, bool) {
	t.Helper()
	nucleo := os.Getenv("HERMES_NUCLEO_MJS")
	if nucleo == "" {
		return "", false
	}
	if _, err := exec.LookPath("node"); err != nil {
		t.Fatalf("HERMES_NUCLEO_MJS definido mas sem node: %v", err)
	}
	script := filepath.Join(t.TempDir(), "avaliar.mjs")
	_ = os.WriteFile(script, []byte(`import { pathToFileURL } from "node:url";
const n = await import(pathToFileURL(process.env.NUCLEO).href);
const l = n.lerLicencaDoDisco(process.env.DIR);
const r = n.avaliar({ texto: l.texto, erroLeitura: l.erroLeitura, marcador: l.marcador,
  chaves: { h1: process.env.PK }, agora: new Date(process.env.AGORA), instalacaoId: process.env.INST });
process.stdout.write(r.decisao);
`), 0o644)
	cmd := exec.Command("node", script)
	cmd.Env = append(os.Environ(), "NUCLEO="+nucleo, "DIR="+arq.dirLicenca, "PK="+pk,
		"AGORA="+formatoTs(agoraHost), "INST="+instalacaoEnv)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("nucleo.mjs: %v %s", err, out)
	}
	return string(out), true
}

func confereContainer(t *testing.T, arq arquivosHermes, host time.Time, inst, pk, esperado string) {
	t.Helper()
	if d := avaliarComChave(t, arq, host, inst, pk); d != esperado {
		t.Fatalf("equivalente Go do avaliar: %s, esperado %s", d, esperado)
	}
	if d, ok := nucleoReal(t, arq, host, inst, pk); ok && d != esperado {
		t.Fatalf("nucleo.mjs REAL: %s, esperado %s", d, esperado)
	}
}

// documento emitido "agora" (no relógio do RV) com offline_ate dado
func docEmitido(t *testing.T, emitido, offline time.Time) []byte {
	return docVariante(t, func(p map[string]any) {
		p["emitido_em"], p["offline_ate"] = formatoTs(emitido), formatoTs(offline)
		p["operar_ate"] = formatoTs(offline.Add(-72 * time.Hour))
	})
}

// S1: relógio do host volta 15 min com o RV inacessível => a checagem LOCAL desarma.
func TestReRevisao_S1_HostVoltaComRVFora(t *testing.T) {
	m, a := novoMundo(t, true)
	d := docEmitido(t, m.agora, m.agora.Add(96*time.Hour))
	m.padrao = respostaFake{status: 200, corpo: corpo200(d, m.agora)}
	a.ciclo()
	if !m.existe(a, marcadorObrigatoria) {
		t.Fatal("pré-condição: armada")
	}
	m.agora = m.agora.Add(-15 * time.Minute)
	for _, falha := range []respostaFake{{err: errors.New("rede")}, {status: 502}, {status: 401, corpo: `{"erro":"AGENTE_NAO_AUTENTICADO"}`}} {
		m.padrao = falha
		a.ciclo()
		if m.existe(a, marcadorObrigatoria) {
			t.Fatalf("falha %v: com o container recusando o documento do disco, obrigatoria deve sair", falha)
		}
		confereContainer(t, a.arq, m.agora, "", vetorPubB64, "liberar")
	}
	if !strings.Contains(eventosDoEstado(a), "hermes_relogio") {
		t.Fatalf("evento hermes_relogio esperado: %s", eventosDoEstado(a))
	}
}

// A checagem local NUNCA cria nada.
func TestReRevisao_ChecagemLocalNuncaCria(t *testing.T) {
	m, a := novoMundo(t, true)
	_ = a.arq.gravarDoc(docEmitido(t, m.agora, m.agora.Add(96*time.Hour)))
	m.padrao = respostaFake{err: errors.New("rede")}
	a.ciclo()
	if m.existe(a, marcadorObrigatoria) || m.existe(a, marcadorBloqueio) {
		t.Fatal("caminho de falha não pode armar nada")
	}
}

// S2: a imagem traz OUTRA chave h1 (troca sem trocar o kid) => remove, evento.
func TestReRevisao_S2_ImagemComOutraChave(t *testing.T) {
	m, a := novoMundo(t, true)
	a.ciclo()
	if !m.existe(a, marcadorObrigatoria) {
		t.Fatal("pré-condição: armada")
	}
	_, outraPub := geraChaveAgente()
	m.info.LicencaChaveFP = fpChaveHermes(outraPub)
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if m.existe(a, marcadorObrigatoria) {
		t.Fatal("imagem com outra chave: obrigatoria deve sair")
	}
	confereContainer(t, a.arq, m.agora, "", outraPub, "liberar")
	if !strings.Contains(eventosDoEstado(a), "hermes_adulteracao") {
		t.Fatalf("evento esperado: %s", eventosDoEstado(a))
	}
}

// S3: idem com o RV inacessível (checagem local).
func TestReRevisao_S3_OutraChaveComRVFora(t *testing.T) {
	m, a := novoMundo(t, true)
	a.ciclo()
	_, outraPub := geraChaveAgente()
	m.info.LicencaChaveFP = fpChaveHermes(outraPub)
	m.padrao = respostaFake{err: errors.New("rede")}
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if m.existe(a, marcadorObrigatoria) {
		t.Fatal("imagem com outra chave e RV fora: obrigatoria deve sair")
	}
	confereContainer(t, a.arq, m.agora, "", outraPub, "liberar")
}

// S4: host atrasado PERSISTENTE; o documento antigo vence (offline_ate) no relógio do RV; o RV
// manda "ativa" que não pode ser entregue => não cria bloqueio pelo velho; desarma obrigatoria.
func TestReRevisao_S4_HostAtrasadoPersistenteNaoBloqueiaPeloVelho(t *testing.T) {
	m, a := novoMundo(t, true)
	t0 := m.agora
	velho := docEmitido(t, t0, t0.Add(time.Hour)) // offline_ate em 1 h
	m.padrao = respostaFake{status: 200, corpo: corpo200(velho, t0)}
	a.ciclo()
	if !m.existe(a, marcadorObrigatoria) || m.existe(a, marcadorBloqueio) {
		t.Fatal("pré-condição: armada, sem bloqueio")
	}
	rv := t0.Add(2 * time.Hour)         // RV já passou do offline_ate do velho
	m.agora = rv.Add(-15 * time.Minute) // host 15 min atrasado
	novo := docEmitido(t, rv, rv.Add(96*time.Hour))
	m.padrao = respostaFake{status: 200, corpo: corpo200(novo, rv)}
	a.ciclo()
	if m.existe(a, marcadorBloqueio) {
		t.Fatal("o RV mandou 'ativa': bloqueio não pode ser criado a partir do documento velho")
	}
	if m.existe(a, marcadorObrigatoria) {
		t.Fatal("documento novo não entregável: obrigatoria deve sair")
	}
	if atual, _ := a.arq.lerDoc(); string(atual) != string(velho) {
		t.Fatal("o documento que o container recusaria não pode ser gravado")
	}
	confereContainer(t, a.arq, m.agora, "", vetorPubB64, "liberar")
	if !strings.Contains(eventosDoEstado(a), `"hermes_relogio"`) {
		t.Fatal("evento hermes_relogio esperado")
	}
}

// Documento recebido não entregável mas BLOQUEANTE: o bloqueio vem dele (do RV), não do velho.
func TestReRevisao_NaoEntregavelBloqueanteCriaBloqueio(t *testing.T) {
	m, a := novoMundo(t, true)
	a.ciclo()
	rv := m.agora.Add(15 * time.Minute)
	bloq := docVariante(t, func(p map[string]any) { p["emitido_em"] = formatoTs(rv); p["bloqueante"] = true })
	m.padrao = respostaFake{status: 200, corpo: corpo200(bloq, rv)}
	a.ciclo()
	if !m.existe(a, marcadorBloqueio) {
		t.Fatal("documento autêntico do RV com bloqueante: bloqueio (o hermes-imagem não sobe versões)")
	}
}

// ── fallback do scope (BAIXO 1) ──

func TestReRevisao_ScopeFallbackPeloErroDoStart(t *testing.T) {
	var chamadas []string
	var mu sync.Mutex
	u := &atualizadorHermes{caminho: "/usr/local/bin/hermes-imagem", timeout: time.Minute, usaScope: func() bool { return true },
		exec: func(ctx context.Context, nome string, args ...string) ([]byte, string, error) {
			mu.Lock()
			chamadas = append(chamadas, nome)
			mu.Unlock()
			if nome == "systemd-run" {
				return nil, "", errors.New(`exec: "systemd-run": executable file not found in $PATH`)
			}
			return []byte("[OK]\n"), "", nil
		}}
	u.Disparar("stable", "")
	esperaEventos(t, u)
	if len(chamadas) != 2 || chamadas[1] != "/usr/local/bin/hermes-imagem" {
		t.Fatalf("erro do Start do systemd-run deve cair no fallback: %v", chamadas)
	}
}

func TestReRevisao_ScopeSemFallbackComPrazoEsgotado(t *testing.T) {
	var chamadas []string
	var mu sync.Mutex
	u := &atualizadorHermes{caminho: "/x/hermes-imagem", timeout: 30 * time.Millisecond, usaScope: func() bool { return true },
		exec: func(ctx context.Context, nome string, args ...string) ([]byte, string, error) {
			mu.Lock()
			chamadas = append(chamadas, nome)
			mu.Unlock()
			<-ctx.Done()
			return []byte("Failed to create bus connection\n"), "", errors.New("signal: killed")
		}}
	u.Disparar("stable", "")
	esperaEventos(t, u)
	if len(chamadas) != 1 {
		t.Fatalf("prazo esgotado: nada de fallback (%v)", chamadas)
	}
}

func TestReRevisao_ScopeSubiuVistoNoInicioDaSaida(t *testing.T) {
	var chamadas []string
	var mu sync.Mutex
	u := &atualizadorHermes{caminho: "/x/hermes-imagem", timeout: time.Minute, usaScope: func() bool { return true },
		exec: func(ctx context.Context, nome string, args ...string) ([]byte, string, error) {
			mu.Lock()
			chamadas = append(chamadas, nome)
			mu.Unlock()
			// cauda (64 KB) sem a linha do scope; o INÍCIO do arquivo a tem
			return []byte("...\n[ERRO] Failed to connect to bus\n"), "Running scope as unit: run-r9.scope\n[INFO] ...", errors.New("exit status 1")
		}}
	u.Disparar("stable", "")
	esperaEventos(t, u)
	if len(chamadas) != 1 {
		t.Fatalf("o scope subiu (início da saída): não pode reexecutar (%v)", chamadas)
	}
}

func TestReRevisao_ExecArquivoDevolveInicioECauda(t *testing.T) {
	e := executorProcesso{arquivo: true, dirTemp: t.TempDir(), graca: time.Second}
	cauda, inicio, err := e.exec(context.Background(), "sh", "-c", `echo "Running scope as unit: x"; head -c 200000 /dev/zero | tr '\0' a; echo; echo FIM`)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(inicio, "Running scope as unit") || len(inicio) > 4096 {
		t.Fatalf("início: %q", inicio[:min(len(inicio), 40)])
	}
	if !strings.HasSuffix(strings.TrimSpace(string(cauda)), "FIM") || len(cauda) > maxSaidaExec {
		t.Fatal("cauda")
	}
}

// ── BAIXO 4: /tmp ──

func TestReRevisao_LimpaRestosAntigosDoTmp(t *testing.T) {
	dir := t.TempDir()
	velho := time.Now().Add(-2 * time.Hour)
	mk := func(nome string, idade time.Time) string {
		p := filepath.Join(dir, nome)
		_ = os.WriteFile(p, []byte("x"), 0o600)
		_ = os.Chtimes(p, idade, idade)
		return p
	}
	antigo := mk(prefixoSaidaUpdate+"1.log", velho)
	recente := mk(prefixoSaidaUpdate+"2.log", time.Now())
	alheio := mk("outro-programa.log", velho)
	d := filepath.Join(dir, prefixoSaidaUpdate+"dir")
	_ = os.Mkdir(d, 0o700)
	_ = os.Chtimes(d, velho, velho)
	limpaSaidasAntigas(dir, time.Now())
	if _, err := os.Stat(antigo); err == nil {
		t.Fatal("resto antigo do próprio agente deveria ser apagado")
	}
	for _, p := range []string{recente, alheio, d} {
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("%s não poderia ser apagado", p)
		}
	}
}

func TestReRevisao_SemEspacoParaSaidaErroClaro(t *testing.T) {
	u := &atualizadorHermes{caminho: "/bin/true", timeout: time.Minute,
		exec: executorProcesso{arquivo: true, dirTemp: filepath.Join(t.TempDir(), "nao-existe"), graca: time.Second}.exec}
	u.Disparar("stable", "")
	evs := esperaEventos(t, u)
	if len(evs) != 1 || evs[0].Tipo != "hermes_update_falhou" || !strings.Contains(evs[0].Mensagem, "arquivo de saída") {
		t.Fatalf("falha ao criar o arquivo de saída deve aparecer claramente: %+v", evs)
	}
}

// ── BAIXO 5: trim do JS ──

func TestReRevisao_TrimIgualAoDoJS(t *testing.T) {
	casos := map[string]string{
		"\ufeffinst-9\ufeff":    "inst-9",       // JS tira BOM; strings.TrimSpace não
		"\u0085inst-9":          "\u0085inst-9", // JS NÃO tira NEL; strings.TrimSpace tira
		" \t\u00a0inst-9\u2028": "inst-9",
		"\u3000inst-9\u200a":    "inst-9",
	}
	for in, want := range casos {
		if got := trimJS(in); got != want {
			t.Errorf("trimJS(%q) = %q, esperado %q", in, got, want)
		}
	}
	insp := strings.Replace(inspectRodando, `"GIT_SHA=f982d5a"]`, `"GIT_SHA=f982d5a","HERMES_INSTALACAO_ID=\u0085inst-9"]`, 1)
	f := &fakeExec{respostas: map[string]respFake{
		"docker inspect --type container hermes":      {out: insp},
		"docker version --format {{.Server.Version}}": {out: "29"},
	}}
	if i := driverTeste(t, f).Observar(context.Background()); i.InstalacaoEnv != "\u0085inst-9" {
		t.Fatalf("env com NEL deve ficar como o container o vê: %q", i.InstalacaoEnv)
	}
	// e a verificação do documento usa o mesmo trim do núcleo
	op := opVetor(t)
	op.instalacaoID = "\ufeff" + vetorInstalacao
	if _, err := verificarDocHermes(vetorEnvelope(), op); err != nil {
		t.Fatalf("BOM é removido pelo trim do JS: %v", err)
	}
	op.instalacaoID = "\u0085" + vetorInstalacao
	if _, err := verificarDocHermes(vetorEnvelope(), op); err == nil {
		t.Fatal("NEL não é removido pelo trim do JS: o container recusaria")
	}
}

// ── BAIXO 3: aceito pelo servidor mas a resposta se perdeu, depois RELOGIO ──

type servidorPerdeResposta struct {
	servidorJanela
	perder map[int]bool
	n      int
}

func (s *servidorPerdeResposta) post(url string, corpo []byte, h map[string]string) (int, []byte, http.Header, error) {
	st, b, hd, err := s.servidorJanela.post(url, corpo, h)
	s.n++
	if s.perder[s.n] {
		return 0, nil, nil, errors.New("timeout lendo a resposta")
	}
	return st, b, hd, err
}

func TestReRevisao_PisoComRespostaPerdidaDepoisRelogio(t *testing.T) {
	m, a := novoMundo(t, true)
	srv := m.agora.Add(-4 * time.Minute) // host 4 min adiantado (aceito)
	s := &servidorPerdeResposta{servidorJanela: servidorJanela{m: m, agora: func() time.Time { return srv }}, perder: map[int]bool{1: true}}
	a.post = s.post
	a.ciclo() // o RV ACEITOU, mas o agente só viu erro de rede
	srv = srv.Add(61 * time.Second)
	m.agora = m.agora.Add(time.Hour + 61*time.Second) // host salta 1 h
	a.ciclo()
	if len(s.status) != 3 || s.status[1] != 409 || s.status[2] != 200 {
		t.Fatalf("após RELOGIO, o piso considera o possivelmente aceito (sem REPLAY): %v", s.status)
	}
}

// ── BAIXO 2: TOCTOU do auto-update ──

func TestReRevisao_AutoUpdateReconfereAntesDoRename(t *testing.T) {
	seed, pub := geraChaveAgente()
	velhoPK := releasePK
	releasePK = pub
	defer func() {
		releasePK = velhoPK
		adiarAutoUpdate = nil
		executavelAgente = os.Executable
		sairAgente = os.Exit
	}()
	bin := []byte("binario-novo")
	sig, _ := assina(bin, seed)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/agente/release") {
			_ = json.NewEncoder(w).Encode(map[string]string{"versao": "9.9.9", "sha256": sha256Hex(bin), "assinatura": sig})
			return
		}
		_, _ = w.Write(bin)
	}))
	defer srv.Close()
	dir := t.TempDir()
	exe := filepath.Join(dir, "agenterv")
	_ = os.WriteFile(exe, []byte("binario-velho"), 0o755)
	executavelAgente = func() (string, error) { return exe, nil }
	saiu := -1
	sairAgente = func(c int) { saiu = c }

	chamadas := 0
	adiarAutoUpdate = func() bool { chamadas++; return chamadas > 1 } // o hermes_update começa no meio do download
	if err := autoAtualiza(&Config{Enderecos: []string{srv.URL}}, "9.9.9", "1.0.0"); err == nil {
		t.Fatal("deveria adiar")
	}
	if b, _ := os.ReadFile(exe); string(b) != "binario-velho" || saiu != -1 {
		t.Fatal("não pode trocar o binário nem sair com o hermes-imagem rodando")
	}
	if ents, _ := os.ReadDir(dir); len(ents) != 1 {
		t.Fatalf("temporário largado: %v", ents)
	}
	// sem update do Hermes: troca e sai (caminho de sempre)
	adiarAutoUpdate = nil
	_ = autoAtualiza(&Config{Enderecos: []string{srv.URL}}, "9.9.9", "1.0.0")
	if b, _ := os.ReadFile(exe); string(b) != "binario-novo" || saiu != 0 {
		t.Fatalf("auto-update normal: %q saiu=%d", b, saiu)
	}
}

// O próprio harness: um estado que o container RECUSA (obrigatoria + documento "no futuro") é
// visto como "recusar" pelo equivalente Go e pelo nucleo.mjs real (prova que a comparação pega).
func TestReRevisao_HarnessDoNucleoDetectaRecusa(t *testing.T) {
	m, a := novoMundo(t, true)
	_ = a.arq.gravarDoc(docEmitido(t, m.agora.Add(15*time.Minute), m.agora.Add(96*time.Hour)))
	_, _ = a.arq.marcador(marcadorObrigatoria, true)
	confereContainer(t, a.arq, m.agora, "", vetorPubB64, "recusar")
	// e um vencido em modo valendo com marcador
	_ = a.arq.gravarDoc(docEmitido(t, m.agora.Add(-100*time.Hour), m.agora.Add(-time.Hour)))
	confereContainer(t, a.arq, m.agora, "", vetorPubB64, "recusar")
}

// X3: com o RV respondendo 200 SEM documento novo entregável, o documento do disco que o
// container recusaria não pode voltar a armar obrigatoria (a checagem local desarmou antes).
func TestReRevisao_DiscoRecusadoNaoRearmaEm200(t *testing.T) {
	m, a := novoMundo(t, true)
	d := docEmitido(t, m.agora, m.agora.Add(96*time.Hour))
	m.padrao = respostaFake{status: 200, corpo: corpo200(d, m.agora)}
	a.ciclo()
	m.agora = m.agora.Add(-15 * time.Minute)                        // host voltou 15 min
	for _, lic := range []string{"null", string(vetorEnvelope())} { // sem documento / documento mais antigo
		m.padrao = respostaFake{status: 200, corpo: corpo200([]byte(lic), m.agora.Add(15*time.Minute))}
		m.agora = m.agora.Add(61 * time.Second)
		a.ciclo()
		if m.existe(a, marcadorObrigatoria) {
			t.Fatalf("licenca=%.10s: documento do disco recusado pelo container não pode rearmar", lic)
		}
		confereContainer(t, a.arq, m.agora, "", vetorPubB64, "liberar")
	}
}

// Y11: timestamp muito adiantado com resposta perdida não pode virar piso eterno após RELOGIO.
func TestReRevisao_PossivelmenteAceitoAdiantadoNaoTravaPiso(t *testing.T) {
	m, a := novoMundo(t, true)
	srv := m.agora
	m.agora = m.agora.Add(24 * time.Hour) // host 1 dia adiantado
	s := &servidorPerdeResposta{servidorJanela: servidorJanela{m: m, agora: func() time.Time { return srv }}, perder: map[int]bool{1: true}}
	a.post = s.post
	a.ciclo() // RELOGIO, mas o agente só viu erro de rede
	srv = srv.Add(61 * time.Second)
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if len(s.status) != 3 || s.status[2] != 200 {
		t.Fatalf("piso não pode ficar preso no timestamp adiantado: %v", s.status)
	}
}

// Y2: documento NÃO entregue que não bloqueia não remove um bloqueio existente (nunca mexe em
// bloqueio a partir do que não chegou ao container) e não emite "liberado".
func TestReRevisao_NaoEntregueNaoRemoveBloqueio(t *testing.T) {
	m, a := novoMundo(t, true)
	bloq := docVariante(t, func(p map[string]any) { p["emitido_em"] = formatoTs(m.agora); p["bloqueante"] = true })
	m.padrao = respostaFake{status: 200, corpo: corpo200(bloq, m.agora)}
	a.ciclo()
	if !m.existe(a, marcadorBloqueio) {
		t.Fatal("pré-condição: bloqueio")
	}
	rv := m.agora.Add(2 * time.Hour)
	m.agora = rv.Add(-15 * time.Minute) // host atrasado
	pago := docEmitido(t, rv, rv.Add(96*time.Hour))
	m.padrao = respostaFake{status: 200, corpo: corpo200(pago, rv)}
	a.ciclo()
	if !m.existe(a, marcadorBloqueio) {
		t.Fatal("documento não entregue não pode remover o bloqueio")
	}
	if strings.Contains(eventosDoEstado(a), "hermes_liberado") {
		t.Fatal("não pode anunciar liberação de algo que não foi aplicado")
	}
}
