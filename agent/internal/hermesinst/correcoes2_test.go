package hermesinst

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Correções da segunda revisão independente.

// ── agente fixado: a versão dos metadados precisa ser a pedida ──

func TestAgenteVersaoFixadaRecusaMetaDeOutraVersao(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	cod := m.rodar("instalar", "--nao-interativo", "--agente-versao=0.6.0") // o RVLand fake devolve 0.7.0
	if cod != SaidaFalha || !strings.Contains(m.saida(), "0.6.0") || !strings.Contains(m.saida(), "0.7.0") {
		t.Fatalf("exit %d, esperava recusa por versão divergente\n%s", cod, m.saida())
	}
	if m.exec.chamou("agenterv enroll") {
		t.Fatal("não pode chegar ao enroll com release de outra versão")
	}
	if len(m.chamadasEm("/api/agente/binario")) != 0 {
		t.Fatal("não pode baixar o binário de uma release divergente")
	}
}

func TestAgenteVersaoFixadaIgualEhAceita(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("instalar", "--nao-interativo", "--agente-versao=0.7.0"); cod != SaidaOK {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
}

// ── reversão de diretório: a identidade do servidor nunca é apagada ──

func TestDesfazerDiretorioNaoApagaIdentidadeDoServidor(t *testing.T) {
	for _, nome := range []string{"agent.conf", "agente.key"} {
		raiz := t.TempDir()
		tx := NovaTransacao(raiz)
		if err := tx.CriarDir("/etc/rvland", 0o755); err != nil {
			t.Fatal(err)
		}
		alvo := filepath.Join(raiz, "etc/rvland", nome)
		if err := os.WriteFile(alvo, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
		erros := tx.Desfazer()
		if _, err := os.Stat(alvo); err != nil {
			t.Fatalf("%s foi apagado no rollback: %v", nome, err)
		}
		if len(erros) == 0 {
			t.Fatalf("a recusa de remover o diretório com %s deveria ser reportada", nome)
		}
	}
	// sem identidade dentro: continua removendo o que criou
	raiz := t.TempDir()
	tx := NovaTransacao(raiz)
	if err := tx.CriarDir("/etc/rvland", 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(raiz, "etc/rvland/outro"), []byte("x"), 0o600)
	if erros := tx.Desfazer(); len(erros) != 0 {
		t.Fatalf("erros: %v", erros)
	}
	if _, err := os.Stat(filepath.Join(raiz, "etc/rvland")); !os.IsNotExist(err) {
		t.Fatal("diretório criado sem identidade deveria ser removido")
	}
}

// ── compensação do container: só quando o inspect diz que ele NÃO existia ──

func TestInspectInconclusivoNaoRegistraRemocaoDoContainer(t *testing.T) {
	casos := map[string]Resultado{
		"timeout":      {Codigo: -1, Err: errors.New("tempo esgotado")},
		"daemon caiu":  {Codigo: 1, Saida: []byte("Cannot connect to the Docker daemon at unix:///var/run/docker.sock")},
		"sem mensagem": {Codigo: 1},
	}
	for nome, res := range casos {
		res := res
		t.Run(nome, func(t *testing.T) {
			m := novoMundo(t)
			m.env["HERMES_CHAVE"] = tChave
			m.exec.imagemRC = 1 // força o rollback depois do inspect
			m.exec.falha = func(c Comando) *Resultado {
				if nomeBase(c) == "docker" && len(c.Args) > 0 && c.Args[0] == "inspect" {
					return &res
				}
				return nil
			}
			if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaFalha {
				t.Fatalf("exit %d\n%s", cod, m.saida())
			}
			if m.exec.chamou("docker rm -f hermes") {
				t.Fatalf("removeria um container possivelmente pré-existente: %v", m.exec.linhas())
			}
		})
	}
}

func TestInspectNoSuchObjectRegistraRemocaoDoContainer(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	m.exec.imagemRC = 1
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaFalha {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	if !m.exec.chamou("docker rm -f hermes") {
		t.Fatalf("container criado nesta execução deveria ser removido: %v", m.exec.linhas())
	}
}

// ── credencial: só stdout ──

func TestCredencialPedeSoStdout(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaOK {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	achou := false
	for _, c := range m.exec.chamadas {
		if nomeBase(c) == "agenterv" && len(c.Args) == 2 && c.Args[0] == "hermes" && c.Args[1] == "credencial" {
			achou = true
			if !c.SoStdout {
				t.Fatal("a credencial deve ser lida só do stdout")
			}
		}
	}
	if !achou {
		t.Fatal("agenterv hermes credencial não foi chamado")
	}
}

func TestExecutorRealSoStdoutSeparaStderr(t *testing.T) {
	c := Comando{Nome: "sh", Args: []string{"-c", "echo saida; echo erro >&2"}, SoStdout: true, Timeout: 10 * time.Second}
	r := ExecutorReal{}.Executar(context.Background(), c)
	if r.Err != nil || r.Codigo != 0 {
		t.Fatalf("%+v", r)
	}
	if got := strings.TrimSpace(string(r.Saida)); got != "saida" {
		t.Fatalf("Saida deveria ter só o stdout: %q", got)
	}
	if got := strings.TrimSpace(string(r.Stderr)); got != "erro" {
		t.Fatalf("Stderr: %q", got)
	}
	c.SoStdout = false
	r = ExecutorReal{}.Executar(context.Background(), c)
	if !strings.Contains(string(r.Saida), "saida") || !strings.Contains(string(r.Saida), "erro") {
		t.Fatalf("sem SoStdout o comportamento antigo (stdout+stderr) se mantém: %q", r.Saida)
	}
}

// ── texto do servidor limpo antes do terminal ──

func TestRespostaDoServidorSemControleNoTerminal(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	m.validarExtra = map[string]any{"cnpj_mascarado": "11.222\x1b[2J", "expira_em": "2026\x1b]0;x\x07"}
	m.tipoChave = "instalacao\x1b[31m" // o fluxo recusa o tipo, mas o validar já imprimiu
	m.rodar("instalar", "--nao-interativo")
	if strings.Contains(m.saida(), "\x1b") || strings.Contains(m.saida(), "\x07") {
		t.Fatalf("caractere de controle do servidor chegou ao terminal: %q", m.saida())
	}

	m2 := novoMundo(t)
	m2.env["HERMES_CHAVE"] = tChave
	m2.statusAtiv, m2.corpoAtiv = 500, `{"erro":"ruim\u001b[2Jfim"}`
	m2.rodar("instalar", "--nao-interativo")
	if strings.Contains(m2.saida(), "\x1b") {
		t.Fatalf("mensagem de erro do servidor sem limpeza: %q", m2.saida())
	}
}
