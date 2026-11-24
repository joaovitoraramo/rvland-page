package hermesinst

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Testes das correções da revisão Opus (M1–M4, mutações sobreviventes e itens baixos).

// ── M1: token do enroll pelo stdin ──

func TestEnrollRecebeTokenPeloStdin(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaOK {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	var enroll *Comando
	for i, c := range m.exec.chamadas {
		if nomeBase(c) == "agenterv" && len(c.Args) > 0 && c.Args[0] == "enroll" && !temArg(c.Args, "--help") {
			enroll = &m.exec.chamadas[i]
		}
	}
	if enroll == nil || !temArg(enroll.Args, "--token-stdin") || flagDe(enroll.Args, "token") != "" || strings.TrimSpace(string(enroll.Stdin)) != tEnrollToken {
		t.Fatalf("enroll deveria receber o token SÓ pelo stdin: %+v", enroll)
	}
	m.semSegredos() // agora varre o argv e o ambiente reais
}

func TestEnrollAgenteAntigoCaiParaArgvComAviso(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	m.exec.agenteAntigo = true
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaOK {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	if !strings.Contains(m.saida(), "--token-stdin") || !strings.Contains(m.saida(), "atualiz") {
		t.Fatalf("deveria avisar que a release do agente precisa ser atualizada:\n%s", m.saida())
	}
	// o token só pode estar no argv do enroll (limite do agente antigo); nunca na saída/log/arquivos
	for _, s := range []string{m.saida(), m.ler(arqLog)} {
		if strings.Contains(s, tEnrollToken) {
			t.Fatal("token vazou na saída/log")
		}
	}
}

// ── M2: sinais ──

func TestSinalNoMeioDoBootstrapFazLimpezaERollback(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	m.exec.falha = func(c Comando) *Resultado {
		if nomeBase(c) == "bash" {
			cancel() // SIGTERM chegou durante a checagem dos scripts
			return &Resultado{Codigo: -1, Err: context.Canceled}
		}
		return nil
	}
	antes := m.foto()
	if cod := m.rodarCtx(ctx, "instalar", "--nao-interativo"); cod != SaidaFalha {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	exigeLimpezaViva(t, m, "docker rm -f "+tCID, "docker logout ghcr.io")
	for _, d := range m.exec.dockerConfigs {
		if _, err := os.Stat(d); err == nil {
			t.Fatalf("DOCKER_CONFIG %s sobrou depois do sinal", d)
		}
	}
	ignorar := []string{arqLog, "/etc/rvland", arqAgenteConf, arqAgenteChave, "/var/lib/rvland", arqAgente}
	if d := difFoto(antes, m.foto(ignorar...)); len(d) > 0 {
		t.Fatalf("rollback incompleto depois do sinal: %v", d)
	}
}

func TestSinalDuranteHermesImagemRemoveContainerERecarregaNginx(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	m.exec.falha = func(c Comando) *Resultado {
		if nomeBase(c) == "hermes-imagem" {
			cancel()
			return &Resultado{Codigo: -1, Err: context.Canceled}
		}
		return nil
	}
	antes := m.foto()
	if cod := m.rodarCtx(ctx, "instalar", "--nao-interativo"); cod != SaidaFalha {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	exigeLimpezaViva(t, m, "docker rm -f hermes", "systemctl reload nginx")
	ignorar := []string{arqLog, "/etc/rvland", arqAgenteConf, arqAgenteChave, "/var/lib/rvland", arqAgente}
	if d := difFoto(antes, m.foto(ignorar...)); len(d) > 0 {
		t.Fatalf("rollback incompleto depois do sinal: %v", d)
	}
}

// exigeLimpezaViva: cada comando de limpeza rodou DEPOIS do cancelamento e com contexto vivo.
func exigeLimpezaViva(t *testing.T, m *mundo, prefixos ...string) {
	t.Helper()
	primeiroCancelado := -1
	for i, c := range m.exec.cancelados {
		if c {
			primeiroCancelado = i
			break
		}
	}
	linhas := m.exec.linhas()
	for _, p := range prefixos {
		achou := false
		for i, l := range linhas {
			if strings.HasPrefix(l, p) && !m.exec.cancelados[i] && i > 0 {
				achou = true
			}
		}
		if !achou {
			t.Errorf("limpeza %q não rodou com contexto vivo (1º comando cancelado #%d):\n%s", p, primeiroCancelado, strings.Join(linhas, "\n"))
		}
	}
}

// ── M3: execuções simultâneas ──

func TestSegundaExecucaoSimultaneaEhRecusada(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	m.exec.segurarImagem, m.exec.entrouImagem = make(chan struct{}), make(chan struct{})
	fim := make(chan int)
	go func() { fim <- Executar(context.Background(), []string{"instalar", "--nao-interativo"}, m.amb()) }()
	<-m.exec.entrouImagem // a 1a está no meio (agente já registrado)

	var out, errb bytes.Buffer
	a2 := m.amb()
	a2.Stdout, a2.Stderr = &out, &errb
	env2 := map[string]string{"HERMES_CHAVE": tChave, "HERMES_WILDFLY_IP": "192.168.1.230", "HERMES_WILDFLY_PORTA": m.env["HERMES_WILDFLY_PORTA"]}
	a2.Getenv = func(k string) string { return env2[k] }
	a2.Unsetenv = func(k string) { delete(env2, k) }
	confAntes := m.ler(arqAgenteConf)
	if cod := Executar(context.Background(), []string{"instalar", "--nao-interativo"}, a2); cod != SaidaPreRequisito {
		t.Fatalf("2a execução: exit %d\n%s%s", cod, out.String(), errb.String())
	}
	if !strings.Contains(out.String()+errb.String(), "outra execução") {
		t.Fatalf("mensagem: %s%s", out.String(), errb.String())
	}
	close(m.exec.segurarImagem)
	if cod := <-fim; cod != SaidaOK {
		t.Fatalf("1a execução: exit %d", cod)
	}
	if m.ler(arqAgenteConf) != confAntes || !m.existe(arqAgenteChave) {
		t.Fatal("a 2a execução mexeu na identidade da 1a")
	}
	if got := len(m.chamadasEm("/api/hermes/ativacao")); got != 1 {
		t.Fatalf("ativação chamada %d vezes", got)
	}
	// a trava foi liberada ao sair
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaOK || !strings.Contains(m.saida(), "já instalado") {
		t.Fatalf("depois de liberar: exit %d\n%s", cod, m.saida())
	}
}

func TestTravaRecusaLinkSimbolico(t *testing.T) {
	m := novoMundo(t)
	fora := filepath.Join(t.TempDir(), "alvo")
	_ = os.WriteFile(fora, []byte("intocado"), 0o644)
	if err := os.Symlink(fora, filepath.Join(m.raiz, strings.TrimPrefix(arqTrava, "/"))); err != nil {
		t.Fatal(err)
	}
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaPreRequisito {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	if b, _ := os.ReadFile(fora); string(b) != "intocado" {
		t.Fatal("trava seguiu o link")
	}
	// e a própria abertura da trava recusa link (sem depender da checagem anterior)
	if lib, _, err := travaExclusiva(filepath.Join(m.raiz, strings.TrimPrefix(arqTrava, "/"))); err == nil {
		lib()
		t.Fatal("travaExclusiva abriu através de symlink")
	}
}

// ── M4: ponto sem volta do enroll ──

func TestEnrollFalhaDepoisDeRegistrarSegueComoJaEnrolado(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	m.exec.enrollEfeito = "conf-e-falha"
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaOK {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	if !m.existe(arqAgenteConf) || !m.existe(arqAgenteChave) {
		t.Fatal("identidade do agente removida")
	}
}

func TestEnrollParcialPreservaChaveDoAgenteESemTrintaMinutos(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	m.exec.enrollEfeito = "so-chave"
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaFalha {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	if !m.existe(arqAgenteChave) {
		t.Fatal("agente.key que o enroll gravou foi apagada")
	}
	if strings.Contains(m.saida(), "30 min") || !strings.Contains(m.saida(), "suporte") {
		t.Fatalf("mensagem errada para falha depois do enroll:\n%s", m.saida())
	}
}

func TestMensagensDaChaveAntesEDepoisDoEnroll(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	m.exec.falha = func(c Comando) *Resultado {
		if nomeBase(c) == "agenterv" && len(c.Args) > 0 && c.Args[0] == "enroll" && !temArg(c.Args, "--help") {
			return &Resultado{Codigo: 1, Saida: []byte("enroll falhou (401)")}
		}
		return nil
	}
	antes := m.foto()
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaFalha {
		t.Fatalf("exit %d", cod)
	}
	if strings.Contains(m.saida(), "30 min") || !strings.Contains(m.saida(), "nova chave") {
		t.Fatalf("enroll tentado não pode prometer reutilizar a chave:\n%s", m.saida())
	}
	if d := difFoto(antes, m.foto(arqLog)); len(d) > 0 {
		t.Fatalf("sem nada gravado pelo enroll, tudo deveria ser desfeito: %v", d)
	}

	m2 := novoMundo(t)
	m2.env["HERMES_CHAVE"] = tChave
	m2.shaMeta = strings.Repeat("0", 64)
	if cod := m2.rodar("instalar", "--nao-interativo"); cod != SaidaFalha || !strings.Contains(m2.saida(), "30 min") {
		t.Fatalf("falha ANTES do enroll deve dizer que a chave vale por 30 min: exit %d\n%s", cod, m2.saida())
	}
}

// ── M03: chave pública de release inválida não consome a chave ──

func TestReleasePKRuimNaoConsomeAChave(t *testing.T) {
	zeros := base64.StdEncoding.EncodeToString(make([]byte, 32))
	identidade := append([]byte{1}, make([]byte, 31)...)
	ordem8, _ := hex.DecodeString("c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a")
	for nome, pk := range map[string]string{
		"vazia":       "",
		"placeholder": "PLACEHOLDER",
		"zeros":       zeros,
		"identidade":  base64.StdEncoding.EncodeToString(identidade),
		"ordem 8":     base64.StdEncoding.EncodeToString(ordem8),
		"31 bytes":    base64.StdEncoding.EncodeToString(make([]byte, 31)),
	} {
		t.Run(nome, func(t *testing.T) {
			m := novoMundo(t)
			m.env["HERMES_CHAVE"] = tChave
			m.pubRelease = pk
			if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaFalha {
				t.Fatalf("exit %d\n%s", cod, m.saida())
			}
			if len(m.chamadasEm("/api/hermes/ativacao")) != 0 {
				t.Fatal("consumiu a chave com chave de release inválida")
			}
		})
	}
}

func TestChavePublicaReleaseValida(t *testing.T) {
	if !chavePublicaReleaseValida(vetorPubB64) {
		t.Fatal("pública válida recusada")
	}
	ordem8, _ := hex.DecodeString("26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05")
	pm1, _ := hex.DecodeString("ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f")
	for _, b := range [][]byte{ordem8, pm1, make([]byte, 32)} {
		if chavePublicaReleaseValida(base64.StdEncoding.EncodeToString(b)) {
			t.Errorf("ponto de ordem pequena aceito: %x", b)
		}
	}
	// a verificação de release também recusa (prova.go). Com a pública = identidade, a "assinatura"
	// R = identidade, S = 0 VALE para qualquer binário no ed25519.Verify: só a checagem do ponto barra.
	bin := []byte("binário qualquer, inclusive malicioso")
	h := sha256.Sum256(bin)
	identidade := append([]byte{1}, make([]byte, 31)...)
	universal := append(append([]byte{1}, make([]byte, 31)...), make([]byte, 32)...)
	if err := VerificarRelease(bin, hex.EncodeToString(h[:]), base64.StdEncoding.EncodeToString(universal), base64.StdEncoding.EncodeToString(identidade)); err == nil {
		t.Fatal("VerificarRelease aceitou pública de ordem pequena (assinatura universal)")
	}
}

// ── M15: arquivos de ops regulares e sem link ──

func TestOpsComLinkOuDiretorioSaoRecusados(t *testing.T) {
	for _, efeito := range []string{"link", "dir"} {
		t.Run(efeito, func(t *testing.T) {
			m := novoMundo(t)
			m.env["HERMES_CHAVE"] = tChave
			m.exec.cpEfeito = efeito
			_ = os.WriteFile(filepath.Join(m.tmp, "fora-da-imagem.sh"), []byte("#!/bin/sh\necho fora\n"), 0o644)
			if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaFalha {
				t.Fatalf("exit %d\n%s", cod, m.saida())
			}
			if m.existe(arqHermesImagem) {
				t.Fatal("hermes-imagem instalado a partir de link/diretório")
			}
		})
	}
}

// ── M16: DOCKER_CONFIG sempre removido ──

func TestDockerConfigRemovidoNoSucessoENaFalha(t *testing.T) {
	for _, falhaPull := range []bool{false, true} {
		m := novoMundo(t)
		m.env["HERMES_CHAVE"] = tChave
		if falhaPull {
			m.exec.falha = func(c Comando) *Resultado {
				if nomeBase(c) == "docker" && len(c.Args) > 0 && c.Args[0] == "pull" {
					return &Resultado{Codigo: 1}
				}
				return nil
			}
		}
		m.rodar("instalar", "--nao-interativo")
		if len(m.exec.dockerConfigs) == 0 {
			t.Fatal("login sem DOCKER_CONFIG isolado")
		}
		for _, d := range m.exec.dockerConfigs {
			if _, err := os.Stat(d); err == nil {
				t.Fatalf("falhaPull=%v: DOCKER_CONFIG %s sobrou", falhaPull, d)
			}
		}
	}
}

// ── M17: redirect não é seguido ──

func TestRedirectDoRVLandNaoESeguido(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	m.redirecionarValidar = true
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaFalha {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	if len(m.chamadasEm("/api/hermes/redirecionado")) != 0 {
		t.Fatal("seguiu o redirect")
	}
}

// ── M18: log nunca segue link ──

func TestLogNaoSegueLink(t *testing.T) {
	dir := t.TempDir()
	alvo := filepath.Join(dir, "alvo")
	_ = os.WriteFile(alvo, []byte("intocado"), 0o644)
	link := filepath.Join(dir, "log")
	_ = os.Symlink(alvo, link)
	if f, err := abrirLogSemSeguirLink(link); err == nil {
		_, _ = f.WriteString("x")
		_ = f.Close()
		t.Fatal("abriu o log através de symlink")
	}
	if b, _ := os.ReadFile(alvo); string(b) != "intocado" {
		t.Fatal("alvo do link alterado")
	}
}

// ── baixos ──

func TestMachineIDAleatorioSoDepoisDaAtivacao(t *testing.T) {
	m := novoMundo(t)
	_ = os.Remove(filepath.Join(m.raiz, "etc/machine-id"))
	m.env["HERMES_CHAVE"] = "hmk_" + strings.Repeat("x", 43) // o RV recusa (401)
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaChaveInvalida {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	if m.existe("/var/lib/rvland") {
		t.Fatal("saída 4 deixou /var/lib/rvland")
	}
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaOK {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	id := strings.TrimSpace(m.ler("/var/lib/rvland/hermes-machine-id"))
	h := sha256.Sum256([]byte(id))
	atv := m.chamadasEm("/api/hermes/ativacao")
	if atv[len(atv)-1].Corpo["fingerprint"].(map[string]any)["machine_id_hash"] != hex.EncodeToString(h[:]) || m.modo("/var/lib/rvland/hermes-machine-id") != 0o600 {
		t.Fatal("id persistido diferente do enviado na ativação (ou modo errado)")
	}
}

func TestPanicoDesfazESai7(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	m.exec.falha = func(c Comando) *Resultado {
		if nomeBase(c) == "hermes-imagem" {
			panic("bug simulado")
		}
		return nil
	}
	antes := m.foto()
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaFalha {
		t.Fatalf("exit %d", cod)
	}
	ignorar := []string{arqLog, "/etc/rvland", arqAgenteConf, arqAgenteChave, "/var/lib/rvland", arqAgente}
	if d := difFoto(antes, m.foto(ignorar...)); len(d) > 0 {
		t.Fatalf("pânico sem rollback: %v", d)
	}
}

func TestAllowedHostInvalidoNoInterativo(t *testing.T) {
	term := &tty{Reader: strings.NewReader("192.168.1.2\n\n\n\n")}
	_, err := coletarRespostas(&Opcoes{AllowedHost: "host inválido;"}, nil, bufio.NewReader(term), term, "10.0.0.5")
	if codigoDe(err) != SaidaUso {
		t.Fatalf("esperava uso, veio %v", err)
	}
}

func TestIdentificacaoSemEscapesDeTerminal(t *testing.T) {
	m := novoMundo(t)
	m.identCorpo = `{"sistema":"hi\u001b[31mper","versao_modulo":"2\u001b]0;x\u0007","lojas":[],"cnpjs":["` + tCNPJ + `"]}`
	m.env["HERMES_CHAVE"] = tChave
	m.rodar("instalar", "--nao-interativo", "--dry-run")
	saida := m.saida() // cada rodar zera a saída: confere as duas
	m.rodar("--mostrar-identificacao")
	saida += m.saida()
	if !strings.Contains(saida, "Identificação local") || strings.ContainsAny(saida, "\x1b\x07") {
		t.Fatalf("escape de terminal na saída (ou identificação não exibida): %q", saida)
	}
}

func TestChaveArquivoQueEhLinkEhRecusado(t *testing.T) {
	m := novoMundo(t)
	real := filepath.Join(m.tmp, "real")
	_ = os.WriteFile(real, []byte(tChave), 0o600)
	link := filepath.Join(m.tmp, "link")
	_ = os.Symlink(real, link)
	if cod := m.rodar("instalar", "--nao-interativo", "--dry-run", "--chave-arquivo="+link); cod != SaidaUso {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
}

func TestRetomadaIgnoraChaveInvalidaNoAmbiente(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaOK {
		t.Fatal(cod)
	}
	m.env["HERMES_CHAVE"] = "hmk_curta"
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaOK {
		t.Fatalf("retomada/já instalado falhou por chave desnecessária: exit %d\n%s", cod, m.saida())
	}
}

func TestNginxNuncaApagaSiteExistente(t *testing.T) {
	casos := map[string]func(m *mundo){
		"default regular": func(m *mundo) {
			_ = os.Remove(filepath.Join(m.raiz, "etc/nginx/sites-enabled/default"))
			m.arquivo("/etc/nginx/sites-enabled/default", "server { listen 80; }\n", 0o644)
		},
		"default para outro site": func(m *mundo) {
			_ = os.Remove(filepath.Join(m.raiz, "etc/nginx/sites-enabled/default"))
			m.arquivo("/etc/nginx/sites-available/loja", "server {}\n", 0o644)
			_ = os.Symlink("/etc/nginx/sites-available/loja", filepath.Join(m.raiz, "etc/nginx/sites-enabled/default"))
		},
	}
	for nome, prep := range casos {
		t.Run(nome, func(t *testing.T) {
			m := novoMundo(t)
			m.env["HERMES_CHAVE"] = tChave
			prep(m)
			antes, _ := os.Lstat(filepath.Join(m.raiz, "etc/nginx/sites-enabled/default"))
			if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaOK {
				t.Fatalf("exit %d\n%s", cod, m.saida())
			}
			depois, err := os.Lstat(filepath.Join(m.raiz, "etc/nginx/sites-enabled/default"))
			if err != nil || depois.Mode() != antes.Mode() {
				t.Fatal("site default que não é o de fábrica foi removido/alterado")
			}
		})
	}
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	m.arquivo("/etc/nginx/sites-available/hermes", "# site do cliente\n", 0o644)
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaOK {
		t.Fatalf("exit %d", cod)
	}
	if m.ler("/etc/nginx/sites-available/hermes") != "# site do cliente\n" {
		t.Fatal("sobrescreveu site existente")
	}
}

func TestServicoQueFalhaFazDisableAntesDeRemoverAUnidade(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	m.exec.falha = func(c Comando) *Resultado {
		if nomeBase(c) == "systemctl" && len(c.Args) > 0 && c.Args[0] == "enable" {
			return &Resultado{Codigo: 1}
		}
		return nil
	}
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaFalha {
		t.Fatalf("exit %d", cod)
	}
	if !m.exec.chamou("systemctl disable " + servicoAgente) {
		t.Fatalf("sem disable no rollback:\n%s", strings.Join(m.exec.linhas(), "\n"))
	}
	if m.existe(arqUnit) {
		t.Fatal("unidade ficou")
	}
}

func TestAvisaRelogioDivergenteDoRVLand(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	m.agora = time.Now().Add(-2 * time.Hour)
	m.rodar("instalar", "--nao-interativo", "--dry-run")
	if !strings.Contains(m.saida(), "relógio") {
		t.Fatalf("deveria avisar do relógio:\n%s", m.saida())
	}
	m.agora = time.Now()
	m.rodar("instalar", "--nao-interativo", "--dry-run")
	if strings.Contains(m.saida(), "relógio") {
		t.Fatal("aviso de relógio com relógio certo")
	}
}

var _ = http.StatusFound
