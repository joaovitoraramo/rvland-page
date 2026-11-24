package hermesinst

import (
	"bufio"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── 6 perguntas ──

type tty struct {
	io.Reader
	out strings.Builder
}

func (t *tty) Write(p []byte) (int, error) { return t.out.Write(p) }

func TestPerguntasInterativasValidamERepetem(t *testing.T) {
	entrada := strings.Join([]string{
		"999.1.1.1",     // IP inválido -> repete
		"192.168.1.230", // 1
		"0",             // porta inválida -> repete
		"8081",          // 2
		"talvez",        // s/N inválido -> repete
		"s",             // 3 acesso externo
		"host inválido!",
		"cliente.ddns.com.br", // 4
		"70000",
		"", // 5 porta externa padrão 65381
		"", // 6 ignorar tags: padrão n
	}, "\n") + "\n"
	term := &tty{Reader: strings.NewReader(entrada)}
	r, err := coletarRespostas(&Opcoes{}, nil, bufio.NewReader(term), term, "10.0.0.5")
	if err != nil {
		t.Fatal(err)
	}
	if r.WildflyIP != "192.168.1.230" || r.WildflyPorta != "8081" || !r.Externo || r.ExternoEndereco != "cliente.ddns.com.br" || r.ExternoPorta != "65381" || r.IgnorarTags {
		t.Fatalf("respostas = %+v", r)
	}
	if r.AllowedHost != "10.0.0.5" {
		t.Fatalf("ALLOWED_HOST padrão deveria ser o IP da máquina: %q", r.AllowedHost)
	}
	saida := term.out.String()
	for _, msg := range []string{"IP inválido", "Porta inválida", "Responda 's' ou 'n'", "Endereço inválido"} {
		if !strings.Contains(saida, msg) {
			t.Errorf("faltou a mensagem %q na saída do terminal:\n%s", msg, saida)
		}
	}
	for _, p := range []string{"Endereço IP interno do servidor WildFly", "Porta do servidor WildFly [8080]", "Deseja habilitar acesso externo? [s/N]", "Endereço externo", "Porta externa [65381]", "ignorar tags"} {
		if !strings.Contains(saida, p) {
			t.Errorf("faltou a pergunta %q", p)
		}
	}
}

func TestPerguntasInterativasFimDaEntradaEhErroDeUso(t *testing.T) {
	term := &tty{Reader: strings.NewReader("1.2.3\n")}
	if _, err := coletarRespostas(&Opcoes{}, nil, bufio.NewReader(term), term, ""); codigoDe(err) != SaidaUso {
		t.Fatalf("EOF sem resposta válida deveria ser erro de uso, veio %v", err)
	}
}

func TestPerguntasNaoInterativas(t *testing.T) {
	env := func(kv map[string]string) func(string) string { return func(k string) string { return kv[k] } }
	casos := []struct {
		nome string
		kv   map[string]string
		ok   bool
		msg  string
	}{
		{"sem IP do WildFly", map[string]string{}, false, "HERMES_WILDFLY_IP"},
		{"IP inválido", map[string]string{"HERMES_WILDFLY_IP": "1.2.3"}, false, "HERMES_WILDFLY_IP"},
		{"porta inválida", map[string]string{"HERMES_WILDFLY_IP": "10.0.0.1", "HERMES_WILDFLY_PORTA": "0"}, false, "HERMES_WILDFLY_PORTA"},
		{"externo sem endereço", map[string]string{"HERMES_WILDFLY_IP": "10.0.0.1", "HERMES_ACESSO_EXTERNO": "s"}, false, "HERMES_EXTERNO_ENDERECO"},
		{"s/N inválido", map[string]string{"HERMES_WILDFLY_IP": "10.0.0.1", "HERMES_IGNORE_TAGS": "talvez"}, false, "HERMES_IGNORE_TAGS"},
		{"mínimo", map[string]string{"HERMES_WILDFLY_IP": "10.0.0.1"}, true, ""},
		{"compat install.sh", map[string]string{"HERMES_API_URL": "http://10.0.0.2:8180", "HERMES_API_URL_EXTERNAL": "http://x.ddns.com.br:65380", "HERMES_IGNORE_TAGS": "true"}, true, ""},
	}
	for _, c := range casos {
		t.Run(c.nome, func(t *testing.T) {
			o := &Opcoes{}
			lerOpcoesAmbiente(o, env(c.kv))
			r, err := coletarRespostas(o, nil, nil, nil, "10.0.0.5")
			if c.ok {
				if err != nil {
					t.Fatal(err)
				}
				if c.nome == "compat install.sh" && (r.WildflyIP != "10.0.0.2" || r.WildflyPorta != "8180" || !r.Externo || r.ExternoEndereco != "x.ddns.com.br" || r.ExternoPorta != "65380" || !r.IgnorarTags) {
					t.Fatalf("compat: %+v", r)
				}
				if c.nome == "mínimo" && (r.WildflyPorta != "8080" || r.Externo || r.IgnorarTags) {
					t.Fatalf("padrões: %+v", r)
				}
				return
			}
			if codigoDe(err) != SaidaUso || !strings.Contains(err.Error(), c.msg) {
				t.Fatalf("esperava erro de uso citando %s, veio %v", c.msg, err)
			}
		})
	}
}

// ── fluxo completo: instalar ──

func TestInstalarFluxoCompleto(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaOK {
		t.Fatalf("exit %d\n%s\n%v", cod, m.saida(), m.exec.linhas())
	}

	// a chave saiu do ambiente antes de qualquer comando filho
	if len(m.unset) == 0 || m.unset[0] != "HERMES_CHAVE" {
		t.Fatalf("HERMES_CHAVE deveria ser removida do ambiente: %v", m.unset)
	}

	// identificação: loopback com o header certo e sem headers de proxy/Origin
	if len(m.identHdrs) == 0 {
		t.Fatal("identificação não foi consultada")
	}
	h := m.identHdrs[0]
	if h.Get("X-Hermes-Instalador") != "1" || h.Get("Origin") != "" || h.Get("X-Forwarded-For") != "" || h.Get("Via") != "" {
		t.Fatalf("headers da identificação: %v", h)
	}

	// validar antes de ativar, ambos com o CNPJ da identificação
	val, atv := m.chamadasEm("/api/hermes/ativacao/validar"), m.chamadasEm("/api/hermes/ativacao")
	if len(val) != 1 || len(atv) != 1 {
		t.Fatalf("validar=%d ativacao=%d", len(val), len(atv))
	}
	if atv[0].Corpo["cnpj"] != tCNPJ || atv[0].Corpo["origem_identificacao"] != "loopback" {
		t.Fatalf("corpo da ativação: %v", atv[0].Corpo)
	}
	fp := atv[0].Corpo["fingerprint"].(map[string]any)
	if fp["machine_id_hash"] != vetorMIH {
		t.Fatalf("machine_id_hash = %v", fp["machine_id_hash"])
	}
	ident := atv[0].Corpo["identificacao"].(map[string]any)
	if ident["sistema"] != "hiper" {
		t.Fatalf("identificacao = %v", ident)
	}

	// agente: binário verificado, enroll em modo Hermes com a instalação e o canal da ativação
	if m.ler("/usr/local/bin/agenterv") != string(m.bin) || m.modo("/usr/local/bin/agenterv") != 0o755 {
		t.Fatal("binário do agente não instalado (0755)")
	}
	var enroll *Comando
	for i, c := range m.exec.chamadas {
		if nomeBase(c) == "agenterv" && len(c.Args) > 0 && c.Args[0] == "enroll" {
			enroll = &m.exec.chamadas[i]
		}
	}
	if enroll == nil || flagDe(enroll.Args, "modo") != "hermes" || flagDe(enroll.Args, "instalacao") != tInstalacao || flagDe(enroll.Args, "canal") != "preview" || flagDe(enroll.Args, "servidor") != m.rv.URL {
		t.Fatalf("enroll: %+v", enroll)
	}

	// arquivos e permissões
	cfg := m.ler("/etc/hermes/config")
	if !strings.Contains(cfg, `INSTALL_DIR="/Services/Hermes"`) || strings.Contains(cfg, "GITHUB_TOKEN") || strings.Contains(cfg, "REPO_URL") {
		t.Fatalf("config:\n%s", cfg)
	}
	env := m.ler("/Services/Hermes/.env.production")
	if !linhaExata(env, "HERMES_INSTALACAO_ID="+tInstalacao) {
		t.Fatalf("HERMES_INSTALACAO_ID deve vir SEM aspas:\n%s", env)
	}
	for _, l := range []string{"NEXT_PUBLIC_API_URL=http://192.168.1.230:" + m.env["HERMES_WILDFLY_PORTA"], "NEXT_PUBLIC_IGNORE_TAGS=false", "ALLOWED_HOST=192.168.1.10", "COOKIE_SECURE=false", "# hermes-env-schema: 2"} {
		if !linhaExata(env, l) {
			t.Errorf(".env.production sem a linha %q:\n%s", l, env)
		}
	}
	if strings.Contains(env, "NEXT_PUBLIC_API_URL_EXTERNAL") {
		t.Error("sem acesso externo não deveria haver NEXT_PUBLIC_API_URL_EXTERNAL")
	}
	esperado := map[string]os.FileMode{
		"/etc/hermes/config":                         0o600,
		"/Services/Hermes/.env.production":           0o600,
		"/etc/hermes/credencial.sh":                  0o700,
		"/etc/hermes/modelo":                         0o644,
		"/usr/local/bin/hermes-imagem":               0o755,
		"/usr/local/bin/hermes-update":               0o755,
		"/usr/local/bin/hermes-rebuild":              0o755,
		"/usr/local/bin/hermes-modulos":              0o755,
		"/usr/local/bin/hermes-manutencao":           0o755,
		"/Services/Hermes/docker-compose.imagem.yml": 0o644,
		"/etc/cron.d/hermes-update":                  0o644,
		"/etc/nginx/sites-available/hermes":          0o644,
		"/etc/systemd/system/rvland-agent.service":   0o644,
		"/var/log/hermes-instalador.log":             0o600,
	}
	for p, md := range esperado {
		if got := m.modo(p); got != md {
			t.Errorf("%s: modo %o, esperado %o", p, got, md)
		}
	}
	if strings.TrimSpace(m.ler("/etc/hermes/modelo")) != "imagem" {
		t.Error("modelo != imagem")
	}
	if !strings.Contains(m.ler("/etc/hermes/credencial.sh"), "agenterv hermes credencial") {
		t.Error("hook de credencial sem a chamada do agente")
	}
	if alvo, err := os.Readlink(filepath.Join(m.raiz, "etc/nginx/sites-enabled/hermes")); err != nil || alvo != "/etc/nginx/sites-available/hermes" {
		t.Errorf("link do nginx: %q %v", alvo, err)
	}
	if m.existe("/etc/nginx/sites-enabled/default") {
		t.Error("o site default do nginx deveria ter saído (como no install.sh)")
	}
	if m.ler("/etc/cron.d/outro") != "0 1 * * * root true\n" {
		t.Error("cron pré-existente alterado")
	}

	// ordem dos comandos: login por stdin -> pull -> create por digest -> cp -> hermes-imagem -> serviço do agente
	linhas := strings.Join(m.exec.linhas(), "\n")
	for _, trecho := range []string{
		"docker login ghcr.io --username " + tUsuarioReg + " --password-stdin",
		"docker pull ghcr.io/rvland-devs/hermes:preview",
		"docker create " + tDigest,
		"docker cp " + tCID + ":/opt/hermes-ops/.",
		"docker rm -f " + tCID,
		"docker logout ghcr.io",
		"hermes-imagem preview",
		"systemctl daemon-reload",
		"systemctl enable --now rvland-agent",
	} {
		if !strings.Contains(linhas, trecho) {
			t.Errorf("faltou o comando %q em:\n%s", trecho, linhas)
		}
	}
	if strings.Index(linhas, "hermes-imagem preview") > strings.Index(linhas, "systemctl enable --now rvland-agent") {
		t.Error("o serviço do agente sobe depois do Hermes")
	}
	m.semSegredos()
	if strings.Contains(m.saida(), "Instalação "+tInstalacao) == false {
		t.Errorf("resumo deveria citar a instalação:\n%s", m.saida())
	}
}

func linhaExata(texto, linha string) bool {
	for _, l := range strings.Split(texto, "\n") {
		if l == linha {
			return true
		}
	}
	return false
}

// ── identificação loopback ──

func TestIdentificacao403SemCNPJManualEhPreRequisitoENadaMuda(t *testing.T) {
	m := novoMundo(t)
	m.identCod = 403
	m.env["HERMES_CHAVE"] = tChave
	antes := m.foto()
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaPreRequisito {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	if !strings.Contains(m.saida(), "403") {
		t.Errorf("mensagem deveria explicar o 403:\n%s", m.saida())
	}
	if len(m.chamadasEm("/api/hermes/ativacao")) != 0 || len(m.chamadasEm("/api/hermes/ativacao/validar")) != 0 {
		t.Fatal("não deveria falar com o RVLand sem identificação")
	}
	if d := difFoto(antes, m.foto()); len(d) > 0 {
		t.Fatalf("FS mudou: %v", d)
	}
}

func TestIdentificacaoFalhaComCNPJManualSegue(t *testing.T) {
	m := novoMundo(t)
	m.identCod = 403
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("instalar", "--nao-interativo", "--cnpj=11.222.333/0001-81"); cod != SaidaOK {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	atv := m.chamadasEm("/api/hermes/ativacao")
	if len(atv) != 1 || atv[0].Corpo["origem_identificacao"] != "manual" || atv[0].Corpo["cnpj"] != tCNPJ {
		t.Fatalf("ativação: %+v", atv)
	}
}

func TestMostrarIdentificacao(t *testing.T) {
	m := novoMundo(t)
	antes := m.foto()
	if cod := m.rodar("--mostrar-identificacao"); cod != SaidaOK {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	if !strings.Contains(m.stdout.String(), `"sistema": "hiper"`) || !strings.Contains(m.stdout.String(), tCNPJ) {
		t.Fatalf("saída:\n%s", m.stdout.String())
	}
	if len(m.chamadas) != 0 {
		t.Fatal("--mostrar-identificacao não envia nada ao RVLand")
	}
	if d := difFoto(antes, m.foto()); len(d) > 0 {
		t.Fatalf("FS mudou: %v", d)
	}
	m.identCod = 403
	if cod := m.rodar("--mostrar-identificacao"); cod != SaidaPreRequisito {
		t.Fatalf("403: exit %d", cod)
	}
}

func TestIdentificacaoComRaizesDiferentesExigeCNPJ(t *testing.T) {
	m := novoMundo(t)
	m.identCorpo = `{"sistema":"superbox","versao_modulo":"2.0.0.8","lojas":[],"cnpjs":["11222333000181","11444777000161"]}`
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaUso {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	m.env["HERMES_CHAVE"] = tChave // o instalador tira a chave do ambiente a cada execução
	if cod := m.rodar("instalar", "--nao-interativo", "--cnpj=11444777000161"); cod != SaidaCNPJ {
		t.Fatalf("CNPJ de outra raiz que a da chave: exit %d\n%s", cod, m.saida())
	}
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("instalar", "--nao-interativo", "--cnpj=99999999000191"); cod != SaidaUso {
		t.Fatalf("CNPJ fora da identificação: exit %d\n%s", cod, m.saida())
	}
}

// ── códigos de saída ──

func TestCodigosDeSaida(t *testing.T) {
	casos := []struct {
		nome   string
		prep   func(m *mundo)
		args   []string
		codigo int
		ativ   int // chamadas esperadas à ativação
		contem string
	}{
		{"flag desconhecida", nil, []string{"instalar", "--xyz"}, SaidaUso, 0, ""},
		{"modo desconhecido", nil, []string{"desinstalar"}, SaidaUso, 0, ""},
		{"sem chave", nil, []string{"instalar", "--nao-interativo"}, SaidaUso, 0, "solicitar"},
		{"formato de chave inválido", func(m *mundo) { m.env["HERMES_CHAVE"] = "hmk_curta" }, []string{"instalar", "--nao-interativo"}, SaidaChaveInvalida, 0, ""},
		{"chave recusada (401)", func(m *mundo) { m.env["HERMES_CHAVE"] = "hmk_" + strings.Repeat("x", 43) }, []string{"instalar", "--nao-interativo"}, SaidaChaveInvalida, 0, "inválida"},
		{"CNPJ divergente (409)", func(m *mundo) { m.env["HERMES_CHAVE"] = tChave; m.cnpjRef = "99888777000100" }, []string{"instalar", "--nao-interativo"}, SaidaCNPJ, 0, "CNPJ"},
		{"chave de adoção no instalar", func(m *mundo) { m.env["HERMES_CHAVE"] = tChave; m.tipoChave = "adocao" }, []string{"instalar", "--nao-interativo"}, SaidaUso, 0, "adotar"},
		{"não é root", func(m *mundo) { m.env["HERMES_CHAVE"] = tChave; m.euid = 1000 }, []string{"instalar", "--nao-interativo"}, SaidaPreRequisito, 0, "root"},
		{"sem systemd", func(m *mundo) { m.env["HERMES_CHAVE"] = tChave; _ = os.RemoveAll(filepath.Join(m.raiz, "run/systemd")) }, []string{"instalar", "--nao-interativo"}, SaidaPreRequisito, 0, "systemd"},
		{"sem espaço", func(m *mundo) { m.env["HERMES_CHAVE"] = tChave; m.espaco = 1 << 30 }, []string{"instalar", "--nao-interativo"}, SaidaPreRequisito, 0, "espaço"},
		{"sem docker", func(m *mundo) {
			m.env["HERMES_CHAVE"] = tChave
			m.exec.falha = func(c Comando) *Resultado {
				if nomeBase(c) == "docker" {
					return &Resultado{Codigo: 127, Err: io.ErrUnexpectedEOF}
				}
				return nil
			}
		}, []string{"instalar", "--nao-interativo"}, SaidaPreRequisito, 0, "docker"},
		{"limite (429)", func(m *mundo) {
			m.env["HERMES_CHAVE"] = tChave
			m.statusVal, m.corpoVal = 429, `{"erro":"LIMITE"}`
		}, []string{"instalar", "--nao-interativo"}, SaidaFalha, 0, "limite"},
		{"ativação 500", func(m *mundo) {
			m.env["HERMES_CHAVE"] = tChave
			m.statusAtiv, m.corpoAtiv = 500, `{"erro":"x"}`
		}, []string{"instalar", "--nao-interativo"}, SaidaFalha, 1, ""},
		{"solicitar", nil, []string{"solicitar"}, SaidaAguardandoChave, 0, "HP-7K3QXM"},
	}
	for _, c := range casos {
		t.Run(c.nome, func(t *testing.T) {
			m := novoMundo(t)
			if c.prep != nil {
				c.prep(m)
			}
			antes := m.foto()
			cod := m.rodar(c.args...)
			if cod != c.codigo {
				t.Fatalf("exit %d, esperado %d\n%s", cod, c.codigo, m.saida())
			}
			if got := len(m.chamadasEm("/api/hermes/ativacao")); got != c.ativ {
				t.Fatalf("ativação chamada %d vezes, esperado %d", got, c.ativ)
			}
			if c.contem != "" && !strings.Contains(m.saida(), c.contem) {
				t.Fatalf("saída sem %q:\n%s", c.contem, m.saida())
			}
			if c.codigo != SaidaOK {
				if d := difFoto(antes, m.foto("/var/log/hermes-instalador.log")); len(d) > 0 {
					t.Fatalf("falha deixou o FS alterado: %v", d)
				}
			}
			m.semSegredos()
		})
	}
}

func TestSolicitarEnviaIdentificacaoSemChave(t *testing.T) {
	m := novoMundo(t)
	if cod := m.rodar("solicitar"); cod != SaidaAguardandoChave {
		t.Fatalf("exit %d", cod)
	}
	s := m.chamadasEm("/api/hermes/solicitacoes")
	if len(s) != 1 || s[0].Corpo["cnpj"] != tCNPJ || s[0].Corpo["chave"] != nil {
		t.Fatalf("solicitação: %+v", s)
	}
	if !strings.Contains(m.stdout.String(), "HP-7K3QXM") {
		t.Fatal("protocolo não impresso")
	}
}

// ── fontes da chave ──

func TestChavePorArquivoStdinEArgumento(t *testing.T) {
	m := novoMundo(t)
	arq := filepath.Join(m.tmp, "chave")
	_ = os.WriteFile(arq, []byte(tChave+"\n"), 0o600)
	if cod := m.rodar("instalar", "--nao-interativo", "--dry-run", "--chave-arquivo="+arq); cod != SaidaOK {
		t.Fatalf("arquivo: exit %d\n%s", cod, m.saida())
	}
	m.stdin = strings.NewReader(tChave + "\n")
	if cod := m.rodar("instalar", "--nao-interativo", "--dry-run", "--chave-stdin"); cod != SaidaOK {
		t.Fatalf("stdin: exit %d\n%s", cod, m.saida())
	}
	m.stdin = nil
	if cod := m.rodar("instalar", "--nao-interativo", "--dry-run", "--chave="+tChave); cod != SaidaOK {
		t.Fatalf("argumento: exit %d\n%s", cod, m.saida())
	}
	if !strings.Contains(m.saida(), "visível") {
		t.Errorf("chave por argumento deveria gerar aviso:\n%s", m.saida())
	}
	if got := len(m.chamadasEm("/api/hermes/ativacao/validar")); got != 3 {
		t.Fatalf("validar chamado %d vezes", got)
	}
	m.semSegredos()
}

// ── dry-run ──

func TestDryRunNaoEscreveNada(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	antes := m.foto()
	if cod := m.rodar("instalar", "--nao-interativo", "--dry-run"); cod != SaidaOK {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	if d := difFoto(antes, m.foto()); len(d) > 0 {
		t.Fatalf("dry-run escreveu: %v", d)
	}
	if len(m.chamadasEm("/api/hermes/ativacao")) != 0 || len(m.chamadasEm("/api/agente/binario")) != 0 {
		t.Fatal("dry-run consumiu a chave ou baixou o agente")
	}
	for _, l := range m.exec.linhas() {
		if !somenteLeitura(l) {
			t.Errorf("dry-run executou comando que altera: %s", l)
		}
	}
	if m.existe(arqTrava) {
		t.Error("dry-run criou a trava")
	}
	entradas, _ := os.ReadDir(m.tmp)
	if len(entradas) != 0 {
		t.Errorf("dry-run criou temporários: %v", entradas)
	}
	for _, trecho := range []string{"DRY-RUN", "/etc/hermes/config", ".env.production", "hermes-imagem preview", "rvland-agent"} {
		if !strings.Contains(m.saida(), trecho) {
			t.Errorf("plano sem %q:\n%s", trecho, m.saida())
		}
	}
	m.semSegredos()
}

func somenteLeitura(l string) bool {
	for _, p := range []string{"docker version", "docker compose version", "docker info", "agenterv ajuda", "docker inspect"} {
		if strings.HasPrefix(l, p) {
			return true
		}
	}
	return false
}

// ── idempotência e retomada ──

func TestReexecucaoNaoDuplicaNemConsomeChave(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaOK {
		t.Fatalf("1a: exit %d\n%s", cod, m.saida())
	}
	antes := m.foto("/var/log/hermes-instalador.log")
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaOK {
		t.Fatalf("2a: exit %d\n%s", cod, m.saida())
	}
	if !strings.Contains(m.saida(), "já instalado") {
		t.Errorf("deveria dizer que já está instalado:\n%s", m.saida())
	}
	if got := len(m.chamadasEm("/api/hermes/ativacao")); got != 1 {
		t.Fatalf("reexecução chamou a ativação de novo (%d)", got)
	}
	if d := difFoto(antes, m.foto("/var/log/hermes-instalador.log")); len(d) > 0 {
		t.Fatalf("reexecução alterou o FS: %v", d)
	}
}

func TestInstalarRecusaAgenteDoCreditEHermesSemAgente(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	m.arquivo("/etc/rvland/agent.conf", `{"servidor_id":"`+tServidor+`"}`, 0o644)
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaPreRequisito || !strings.Contains(m.saida(), "adotar") {
		t.Fatalf("agente do Credit: exit %d\n%s", cod, m.saida())
	}
	m2 := novoMundo(t)
	m2.env["HERMES_CHAVE"] = tChave
	m2.arquivo("/etc/hermes/config", "INSTALL_DIR=\"/Services/Hermes\"\n", 0o600)
	if cod := m2.rodar("instalar", "--nao-interativo"); cod != SaidaPreRequisito || !strings.Contains(m2.saida(), "adotar") {
		t.Fatalf("Hermes sem agente: exit %d\n%s", cod, m2.saida())
	}
	if len(m.chamadasEm("/api/hermes/ativacao"))+len(m2.chamadasEm("/api/hermes/ativacao")) != 0 {
		t.Fatal("não deveria consumir a chave")
	}
}

// ── rollback em cada etapa ──

func TestRollbackEmCadaEtapa(t *testing.T) {
	falhaEm := func(nome string, sub ...string) func(c Comando) *Resultado {
		return func(c Comando) *Resultado {
			if nomeBase(c) != nome {
				return nil
			}
			for i, s := range sub {
				if i >= len(c.Args) || c.Args[i] != s {
					return nil
				}
			}
			return &Resultado{Codigo: 1, Saida: []byte("falha simulada")}
		}
	}
	casos := []struct {
		nome       string
		prep       func(m *mundo)
		agenteFica bool // depois do enroll o agente fica (retomada sem chave)
	}{
		{"sha256 errado", func(m *mundo) { m.shaMeta = strings.Repeat("0", 64) }, false},
		{"enroll falha", func(m *mundo) {
			m.exec.falha = func(c Comando) *Resultado {
				if nomeBase(c) == "agenterv" && len(c.Args) > 0 && c.Args[0] == "enroll" && !temArg(c.Args, "--help") {
					return &Resultado{Codigo: 1, Saida: []byte("falha simulada")}
				}
				return nil
			}
		}, false},
		{"credencial falha", func(m *mundo) { m.exec.falha = falhaEm("agenterv", "hermes", "credencial") }, true},
		{"login falha", func(m *mundo) { m.exec.falha = falhaEm("docker", "login") }, true},
		{"pull falha", func(m *mundo) { m.exec.falha = falhaEm("docker", "pull") }, true},
		{"bash -n falha", func(m *mundo) { m.exec.falha = falhaEm("bash", "-n") }, true},
		{"hermes-imagem falha", func(m *mundo) { m.exec.imagemRC = 1 }, true},
	}
	for _, c := range casos {
		t.Run(c.nome, func(t *testing.T) {
			m := novoMundo(t)
			m.env["HERMES_CHAVE"] = tChave
			c.prep(m)
			antes := m.foto()
			if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaFalha {
				t.Fatalf("exit %d\n%s", cod, m.saida())
			}
			ignorar := []string{"/var/log/hermes-instalador.log"}
			if c.agenteFica {
				ignorar = append(ignorar, "/etc/rvland", "/etc/rvland/agent.conf", "/etc/rvland/agente.key", "/var/lib/rvland", "/usr/local/bin/agenterv")
				if !m.existe("/etc/rvland/agent.conf") {
					t.Fatal("depois do enroll o agente deveria ficar (retomada sem chave)")
				}
				if !strings.Contains(m.saida(), "retomar") {
					t.Errorf("deveria orientar a retomada:\n%s", m.saida())
				}
			}
			if d := difFoto(antes, m.foto(ignorar...)); len(d) > 0 {
				t.Fatalf("rollback incompleto: %v", d)
			}
			// o site default do nginx (link) e o cron pré-existente voltam intactos
			if alvo, err := os.Readlink(filepath.Join(m.raiz, "etc/nginx/sites-enabled/default")); err != nil || alvo != "/etc/nginx/sites-available/default" {
				t.Fatalf("link default do nginx não restaurado: %q %v", alvo, err)
			}
			m.semSegredos()

			if c.agenteFica {
				// retomada: sem chave, sem nova ativação
				m.exec.falha, m.exec.imagemRC = nil, 0
				delete(m.env, "HERMES_CHAVE")
				if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaOK {
					t.Fatalf("retomada: exit %d\n%s", cod, m.saida())
				}
				if got := len(m.chamadasEm("/api/hermes/ativacao")); got != 1 {
					t.Fatalf("retomada chamou a ativação de novo (%d)", got)
				}
				if !linhaExata(m.ler("/Services/Hermes/.env.production"), "HERMES_INSTALACAO_ID="+tInstalacao) {
					t.Fatal("retomada não gravou o .env.production")
				}
			}
		})
	}
}

func TestNginxQueFalhaNoTesteNaoDerrubaAInstalacao(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	n := 0
	m.exec.falha = func(c Comando) *Resultado {
		if nomeBase(c) == "nginx" {
			n++
			if n == 2 { // o 1o -t (antes) passa; o 2o (depois de gravar) falha
				return &Resultado{Codigo: 1, Saida: []byte("nginx: [emerg]")}
			}
		}
		return nil
	}
	if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaOK {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	if m.existe("/etc/nginx/sites-available/hermes") || m.existe("/etc/nginx/sites-enabled/hermes") {
		t.Fatal("config do nginx que falhou no teste deveria ser desfeita")
	}
	if _, err := os.Readlink(filepath.Join(m.raiz, "etc/nginx/sites-enabled/default")); err != nil {
		t.Fatal("default do nginx deveria voltar")
	}
	if !strings.Contains(m.saida(), "3000") {
		t.Errorf("deveria avisar do acesso pela porta 3000:\n%s", m.saida())
	}
}

// ── downloads recusados ──

func TestDownloadDoAgenteRecusado(t *testing.T) {
	casos := map[string]func(m *mundo){
		"assinatura inválida":   func(m *mundo) { m.assinMeta = m.assinMeta[:10] + "AAAA" + m.assinMeta[14:] },
		"header sha divergente": func(m *mundo) { m.hdrSha = strings.Repeat("1", 64) },
		"sha256 errado":         func(m *mundo) { m.shaMeta = strings.Repeat("2", 64) },
		"sem chave de release":  func(m *mundo) { m.pubRelease = "" },
	}
	for nome, prep := range casos {
		t.Run(nome, func(t *testing.T) {
			m := novoMundo(t)
			m.env["HERMES_CHAVE"] = tChave
			prep(m)
			if cod := m.rodar("instalar", "--nao-interativo"); cod != SaidaFalha {
				t.Fatalf("exit %d\n%s", cod, m.saida())
			}
			if m.existe("/usr/local/bin/agenterv") {
				t.Fatal("binário não verificado foi instalado")
			}
			if m.exec.chamou("agenterv") {
				t.Fatal("executou binário não verificado")
			}
		})
	}
}

// ── symlink em destino ──

func TestNaoSegueSymlinkEmDestino(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	fora := t.TempDir()
	if err := os.Symlink(fora, filepath.Join(m.raiz, "etc/hermes")); err != nil {
		t.Fatal(err)
	}
	if cod := m.rodar("instalar", "--nao-interativo"); cod == SaidaOK {
		t.Fatalf("seguiu o symlink /etc/hermes\n%s", m.saida())
	}
	if ents, _ := os.ReadDir(fora); len(ents) != 0 {
		t.Fatalf("escreveu fora da raiz pelo symlink: %v", ents)
	}
	if len(m.chamadasEm("/api/hermes/ativacao")) != 0 {
		t.Fatal("symlink detectado só depois de consumir a chave")
	}
}

// ── adoção ──

func TestAdotarComProvaAssinadaVetorCruzado(t *testing.T) {
	m := novoMundo(t)
	m.comAgenteEHermesImagem()
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("adotar", "--nao-interativo", "--instalacao="+m.inst); cod != SaidaOK {
		t.Fatalf("exit %d\n%s\n%v", cod, m.saida(), m.exec.linhas())
	}
	atv := m.chamadasEm("/api/hermes/ativacao")
	if len(atv) != 1 {
		t.Fatalf("ativação: %d", len(atv))
	}
	ae := atv[0].Corpo["agente_existente"].(map[string]any)
	if ae["servidor_id"] != tServidor || ae["timestamp"] != vetorTs || ae["assinatura"] != vetorAssinatura {
		t.Fatalf("prova de adoção fora do vetor cruzado com o TS: %v", ae)
	}
	if atv[0].Corpo["fingerprint"].(map[string]any)["machine_id_hash"] != vetorMIH {
		t.Fatal("machine_id_hash da prova e do fingerprint precisam ser o mesmo")
	}
	env := m.ler("/Services/Hermes/.env.production")
	if !linhaExata(env, "HERMES_INSTALACAO_ID="+m.inst) || !linhaExata(env, "ALLOWED_HOST=192.168.1.10") || !linhaExata(env, "NEXT_PUBLIC_IGNORE_TAGS=false") {
		t.Fatalf(".env.production preservado + id:\n%s", env)
	}
	if m.modo("/Services/Hermes/.env.production") != 0o600 || m.modo("/etc/hermes/credencial.sh") != 0o700 {
		t.Fatal("permissões")
	}
	linhas := strings.Join(m.exec.linhas(), "\n")
	for _, trecho := range []string{"agenterv hermes configurar --instalacao=" + m.inst + " --canal=preview", "hermes-imagem preview", "systemctl restart rvland-agent"} {
		if !strings.Contains(linhas, trecho) {
			t.Errorf("faltou %q em:\n%s", trecho, linhas)
		}
	}
	if m.exec.chamou("agenterv enroll") || len(m.chamadasEm("/api/agente/binario")) != 0 {
		t.Fatal("adoção não reinstala nem re-enrola o agente")
	}
	var conf map[string]any
	_ = json.Unmarshal([]byte(m.ler("/etc/rvland/agent.conf")), &conf)
	if conf["hermes"] == nil || conf["modo"] != nil {
		t.Fatalf("agent.conf adotado (Credit + bloco hermes, sem modo): %v", conf)
	}
	m.semSegredos()
	// a seed do agente só pode estar no agente.key: nunca na saída nem no log
	if strings.Contains(m.saida(), vetorSeedB64) || strings.Contains(m.ler("/var/log/hermes-instalador.log"), vetorSeedB64) {
		t.Fatal("seed do agente vazou na saída/log")
	}

	// reexecução: já adotado, nada muda
	antes := m.foto("/var/log/hermes-instalador.log")
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("adotar", "--nao-interativo", "--instalacao="+m.inst); cod != SaidaOK {
		t.Fatalf("2a: exit %d\n%s", cod, m.saida())
	}
	if len(m.chamadasEm("/api/hermes/ativacao")) != 1 {
		t.Fatal("reexecução chamou a ativação")
	}
	if d := difFoto(antes, m.foto("/var/log/hermes-instalador.log")); len(d) > 0 {
		t.Fatalf("reexecução alterou: %v", d)
	}
}

func TestAdotarInstalacaoPeloValidar(t *testing.T) {
	m := novoMundo(t)
	m.comAgenteEHermesImagem()
	m.instValidar = true
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("adotar", "--nao-interativo"); cod != SaidaOK {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
}

func TestAdotarSemInstalacaoEhUsoSemConsumir(t *testing.T) {
	m := novoMundo(t)
	m.comAgenteEHermesImagem()
	m.env["HERMES_CHAVE"] = tChave
	if cod := m.rodar("adotar", "--nao-interativo"); cod != SaidaUso || !strings.Contains(m.saida(), "--instalacao") {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	if len(m.chamadasEm("/api/hermes/ativacao")) != 0 {
		t.Fatal("consumiu")
	}
}

func TestAdotarRollbackQuandoHermesImagemFalha(t *testing.T) {
	m := novoMundo(t)
	m.comAgenteEHermesImagem()
	m.env["HERMES_CHAVE"] = tChave
	m.exec.imagemRC = 1
	antes := m.foto()
	if cod := m.rodar("adotar", "--nao-interativo", "--instalacao="+m.inst); cod != SaidaFalha {
		t.Fatalf("exit %d\n%s", cod, m.saida())
	}
	// o estado.json e o /var/lib/hermes são do hermes-imagem (que tem rollback próprio)
	if d := difFoto(antes, m.foto("/var/log/hermes-instalador.log", "/var/lib/hermes", "/var/lib/hermes/estado.json")); len(d) > 0 {
		t.Fatalf("rollback da adoção incompleto: %v", d)
	}
	if !strings.Contains(m.saida(), "30 min") {
		t.Errorf("deveria dizer que a chave vale de novo nesta máquina por 30 min:\n%s", m.saida())
	}
}

func TestAdotarExigeAgenteEModoImagem(t *testing.T) {
	m := novoMundo(t)
	m.env["HERMES_CHAVE"] = tChave
	m.tipoChave = "adocao"
	if cod := m.rodar("adotar", "--nao-interativo", "--instalacao="+m.inst); cod != SaidaPreRequisito {
		t.Fatalf("sem agente: exit %d\n%s", cod, m.saida())
	}
	m2 := novoMundo(t)
	m2.comAgenteEHermesImagem()
	_ = os.Remove(filepath.Join(m2.raiz, "etc/hermes/modelo"))
	m2.env["HERMES_CHAVE"] = tChave
	if cod := m2.rodar("adotar", "--nao-interativo", "--instalacao="+m2.inst); cod != SaidaPreRequisito || !strings.Contains(m2.saida(), "imagem") {
		t.Fatalf("Hermes no modelo git: exit %d\n%s", cod, m2.saida())
	}
}

// ── comando exibido (log) nunca carrega segredo ──

func TestComandoExibidoMascaraSegredos(t *testing.T) {
	c := Comando{Nome: "/usr/local/bin/agenterv", Args: []string{"enroll", "--token=" + tEnrollToken}, Segredos: []string{tEnrollToken}}
	if strings.Contains(c.Exibir(), tEnrollToken) {
		t.Fatal(c.Exibir())
	}
}
