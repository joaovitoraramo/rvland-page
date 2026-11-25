package hermesinst

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// Mundo de teste: raiz de sistema de arquivos temporária, RVLand fake (httptest TLS),
// SyncAutenticacao fake (loopback), /api/saude fake e executor de comandos fake.
// Nenhum comando real é executado e nada sai para a rede além do loopback dos testes.

const (
	tChave       = "hmk_TESTEtesteTESTEtesteTESTEtesteTESTEteste012"
	tEnrollToken = "enroll-TOKEN-segredo-0123456789"
	tSenhaReg    = "ghs_SENHAregistroSEGREDO987"
	tUsuarioReg  = "rvland-bot"
	tInstalacao  = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
	tServidor    = "11111111-2222-4333-8444-555555555555"
	tCNPJ        = "11222333000181"
	tDigest      = "ghcr.io/rvland-devs/hermes@sha256:" + "ab0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd"
	tCID         = "c0ffee0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
)

type chamadaRV struct {
	Metodo  string
	Caminho string
	Corpo   map[string]any
	Headers http.Header
}

type mundo struct {
	t     *testing.T
	raiz  string
	tmp   string
	rv    *httptest.Server
	local *httptest.Server
	saude *httptest.Server
	exec  *fakeExec

	stdout, stderr bytes.Buffer
	env            map[string]string
	unset          []string
	terminal       io.ReadWriter
	stdin          io.Reader
	euid           int
	espaco         uint64
	agora          time.Time

	mu         sync.Mutex
	chamadas   []chamadaRV
	identHdrs  []http.Header
	identCod   int
	identCorpo string
	saudeCod   int

	// comportamento do RVLand fake
	tipoChave    string         // instalacao | adocao
	validarExtra map[string]any // sobrescreve campos da resposta do validar
	canal        string
	cnpjRef      string
	statusVal    int
	corpoVal     string
	statusAtiv   int
	corpoAtiv    string
	instValidar  bool // validar devolve instalacao_id (contrato futuro)
	pubRelease   string
	privRelease  ed25519.PrivateKey
	bin          []byte
	shaMeta      string
	assinMeta    string
	hdrSha       string
	pubAgente    ed25519.PublicKey
	inst         string // instalacao_id devolvido pelo fake

	redirecionarValidar bool
}

func novoMundo(t *testing.T) *mundo {
	t.Helper()
	m := &mundo{
		t: t, raiz: t.TempDir(), tmp: t.TempDir(), env: map[string]string{}, euid: 0, espaco: 50 << 30,
		agora: time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC), identCod: 200, saudeCod: 200,
		tipoChave: "instalacao", canal: "preview", inst: tInstalacao, cnpjRef: tCNPJ, statusVal: 200, statusAtiv: 200,
	}
	m.identCorpo = `{"sistema":"hiper","versao_modulo":"2.0.0.8","lojas":[{"codigo":1,"nome":"Matriz"}],"cnpjs":["` + tCNPJ + `"]}`
	pub, priv, _ := ed25519.GenerateKey(nil)
	m.pubRelease, m.privRelease = base64.StdEncoding.EncodeToString(pub), priv
	m.bin = []byte("\x7fELF agenterv falso para testes")
	h := sha256.Sum256(m.bin)
	m.shaMeta = hex.EncodeToString(h[:])
	m.hdrSha = m.shaMeta
	m.assinMeta = base64.StdEncoding.EncodeToString(ed25519.Sign(priv, m.bin))
	pa, _ := base64.StdEncoding.DecodeString(vetorPubB64)
	m.pubAgente = pa

	m.rv = httptest.NewTLSServer(http.HandlerFunc(m.handlerRV))
	t.Cleanup(m.rv.Close)
	m.local = httptest.NewServer(http.HandlerFunc(m.handlerIdent))
	t.Cleanup(m.local.Close)
	m.saude = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.mu.Lock()
		c := m.saudeCod
		m.mu.Unlock()
		w.WriteHeader(c)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(m.saude.Close)
	m.exec = &fakeExec{m: m}

	// sistema "limpo": Linux com systemd, docker, nginx (com o site default) e cron
	m.arquivo("/etc/machine-id", vetorMachineID+"\n", 0o444)
	m.arquivo("/etc/os-release", "PRETTY_NAME=\"Debian GNU/Linux 12\"\nID=debian\n", 0o644)
	m.dir("/run/systemd/system")
	m.dir("/usr/local/bin")
	m.dir("/var/log")
	m.dir("/var/lib")
	m.arquivo("/etc/nginx/sites-available/default", "server { listen 80 default_server; }\n", 0o644)
	m.dir("/etc/nginx/sites-enabled")
	if err := os.Symlink("/etc/nginx/sites-available/default", filepath.Join(m.raiz, "etc/nginx/sites-enabled/default")); err != nil {
		t.Fatal(err)
	}
	m.arquivo("/etc/cron.d/outro", "0 1 * * * root true\n", 0o644)

	porta := m.local.Listener.Addr().(*net.TCPAddr).Port
	m.env["HERMES_WILDFLY_IP"] = "192.168.1.230"
	m.env["HERMES_WILDFLY_PORTA"] = strconv.Itoa(porta)
	return m
}

func (m *mundo) arquivo(p, conteudo string, modo os.FileMode) {
	m.t.Helper()
	r := filepath.Join(m.raiz, p)
	if err := os.MkdirAll(filepath.Dir(r), 0o755); err != nil {
		m.t.Fatal(err)
	}
	if err := os.WriteFile(r, []byte(conteudo), modo); err != nil {
		m.t.Fatal(err)
	}
	_ = os.Chmod(r, modo)
}

func (m *mundo) dir(p string) {
	m.t.Helper()
	if err := os.MkdirAll(filepath.Join(m.raiz, p), 0o755); err != nil {
		m.t.Fatal(err)
	}
}

func (m *mundo) ler(p string) string {
	m.t.Helper()
	b, err := os.ReadFile(filepath.Join(m.raiz, p))
	if err != nil {
		m.t.Fatalf("ler %s: %v", p, err)
	}
	return string(b)
}

func (m *mundo) modo(p string) os.FileMode {
	m.t.Helper()
	fi, err := os.Lstat(filepath.Join(m.raiz, p))
	if err != nil {
		m.t.Fatalf("stat %s: %v", p, err)
	}
	return fi.Mode().Perm()
}

func (m *mundo) existe(p string) bool {
	_, err := os.Lstat(filepath.Join(m.raiz, p))
	return err == nil
}

// sistema com o agente RV do Credit já instalado e o Hermes no modo imagem (cliente a adotar)
func (m *mundo) comAgenteEHermesImagem() {
	m.arquivo("/etc/rvland/agent.conf", `{"enderecos":["https://rvland.com.br"],"servidor_id":"`+tServidor+`","driver":"systemd"}`, 0o644)
	m.arquivo("/etc/rvland/agente.key", vetorSeedB64+"\n", 0o600)
	m.arquivo("/usr/local/bin/agenterv", "agente antigo", 0o755)
	m.arquivo("/etc/systemd/system/rvland-agent.service", unitAgente, 0o644)
	m.arquivo("/etc/hermes/config", "INSTALL_DIR=\"/Services/Hermes\"\nWILDFLY_DIR=\"/banco/wildfly/standalone\"\n", 0o600)
	m.arquivo("/etc/hermes/modelo", "imagem\n", 0o644)
	porta := m.env["HERMES_WILDFLY_PORTA"]
	m.arquivo("/Services/Hermes/.env.production", "# hermes-env-schema: 2\nNEXT_PUBLIC_API_URL=http://192.168.1.230:"+porta+"\nNEXT_PUBLIC_IGNORE_TAGS=false\nALLOWED_HOST=192.168.1.10\nCOOKIE_SECURE=false\n", 0o644)
	m.arquivo("/usr/local/bin/hermes-imagem", "#!/bin/bash\n", 0o755)
	m.arquivo("/usr/local/bin/hermes-update", "#!/bin/bash\n", 0o755)
	m.tipoChave = "adocao"
	m.inst = vetorInstalacao // a prova sai igual à do vetor gerado pelo TS
	m.agora = time.Unix(vetorTsInstante, 0)
}

func (m *mundo) amb() *Ambiente {
	cliRV := m.rv.Client()
	return &Ambiente{
		Raiz:   m.raiz,
		Stdout: &m.stdout,
		Stderr: &m.stderr,
		Stdin:  m.stdin,
		Getenv: func(k string) string {
			m.mu.Lock()
			defer m.mu.Unlock()
			return m.env[k]
		},
		Unsetenv: func(k string) {
			m.mu.Lock()
			defer m.mu.Unlock()
			delete(m.env, k)
			m.unset = append(m.unset, k)
		},
		Terminal:        m.terminal,
		Euid:            m.euid,
		Arch:            "amd64",
		Exec:            m.exec,
		HTTPRV:          cliRV,
		HTTPLocal:       &http.Client{Timeout: 5 * time.Second},
		BaseURL:         m.rv.URL,
		ReleasePK:       m.pubRelease,
		Versao:          "0.1.0-teste",
		SaudeURL:        m.saude.URL + "/api/saude",
		Agora:           func() time.Time { return m.agora },
		IPMaquina:       func() string { return "192.168.1.10" },
		Hostname:        func() (string, error) { return "servidor-teste", nil },
		EspacoLivre:     func(string) (uint64, error) { return m.espaco, nil },
		Dormir:          func(time.Duration) {},
		TempDir:         m.tmp,
		TentativasSaude: 2,
	}
}

func (m *mundo) rodar(args ...string) int {
	m.t.Helper()
	m.stdout.Reset()
	m.stderr.Reset()
	return Executar(context.Background(), args, m.amb())
}

func (m *mundo) rodarCtx(ctx context.Context, args ...string) int {
	m.t.Helper()
	m.stdout.Reset()
	m.stderr.Reset()
	return Executar(ctx, args, m.amb())
}

func (m *mundo) saida() string { return m.stdout.String() + m.stderr.String() }

func (m *mundo) chamadasEm(caminho string) []chamadaRV {
	m.mu.Lock()
	defer m.mu.Unlock()
	var r []chamadaRV
	for _, c := range m.chamadas {
		if c.Caminho == caminho {
			r = append(r, c)
		}
	}
	return r
}

// ── RVLand fake ──

func (m *mundo) handlerRV(w http.ResponseWriter, r *http.Request) {
	corpo := map[string]any{}
	if r.Body != nil {
		b, _ := io.ReadAll(r.Body)
		if len(b) > 0 {
			if err := json.Unmarshal(b, &corpo); err != nil {
				w.WriteHeader(400)
				_, _ = w.Write([]byte(`{"erro":"JSON_INVALIDO"}`))
				return
			}
		}
	}
	m.mu.Lock()
	m.chamadas = append(m.chamadas, chamadaRV{r.Method, r.URL.Path, corpo, r.Header.Clone()})
	m.mu.Unlock()
	responder := func(status int, v any) {
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(v)
	}
	estrito := func(permitidos ...string) bool {
		ok := map[string]bool{}
		for _, k := range permitidos {
			ok[k] = true
		}
		for k := range corpo {
			if !ok[k] {
				responder(422, map[string]string{"erro": "CORPO_INVALIDO", "campo": k})
				return false
			}
		}
		return true
	}
	if m.redirecionarValidar && r.URL.Path == "/api/hermes/ativacao/validar" {
		w.Header().Set("Location", "/api/hermes/redirecionado")
		w.WriteHeader(http.StatusFound)
		return
	}
	switch {
	case r.URL.Path == "/api/hermes/redirecionado":
		responder(200, map[string]any{"tipo": "instalacao", "canal": "stable"})
	case r.Method == "POST" && r.URL.Path == "/api/hermes/ativacao/validar":
		if !estrito("chave", "cnpj", "fingerprint", "identificacao", "origem_identificacao", "versao_instalador") {
			return
		}
		if m.statusVal != 200 {
			w.WriteHeader(m.statusVal)
			_, _ = w.Write([]byte(m.corpoVal))
			return
		}
		if corpo["chave"] != tChave {
			responder(401, map[string]string{"erro": "CHAVE_INVALIDA"})
			return
		}
		if !strings.HasPrefix(fmt.Sprint(corpo["cnpj"]), m.cnpjRef[:8]) {
			responder(409, map[string]string{"erro": "CNPJ_DIVERGENTE"})
			return
		}
		resp := map[string]any{"tipo": m.tipoChave, "cliente_nome": "Cliente Teste", "cnpj_mascarado": "11.222.333/****-**", "canal": m.canal, "expira_em": "2026-11-25T00:00:00.000Z"}
		if m.instValidar {
			resp["instalacao_id"] = m.inst
		}
		for k, v := range m.validarExtra {
			resp[k] = v
		}
		responder(200, resp)
	case r.Method == "POST" && r.URL.Path == "/api/hermes/ativacao":
		if !estrito("chave", "cnpj", "fingerprint", "identificacao", "origem_identificacao", "versao_instalador", "agente_existente") {
			return
		}
		if m.statusAtiv != 200 {
			w.WriteHeader(m.statusAtiv)
			_, _ = w.Write([]byte(m.corpoAtiv))
			return
		}
		if corpo["chave"] != tChave {
			responder(401, map[string]string{"erro": "CHAVE_INVALIDA"})
			return
		}
		fp, _ := corpo["fingerprint"].(map[string]any)
		mih, _ := fp["machine_id_hash"].(string)
		if len(mih) < 16 {
			responder(422, map[string]string{"erro": "CORPO_INVALIDO"})
			return
		}
		if m.tipoChave == "adocao" {
			ae, _ := corpo["agente_existente"].(map[string]any)
			ts, _ := ae["timestamp"].(string)
			sig, _ := base64.StdEncoding.DecodeString(fmt.Sprint(ae["assinatura"]))
			msg := MensagemHermes("ativacao", ts, []byte(m.inst+"\n"+mih))
			if ae["servidor_id"] != tServidor || !ed25519.Verify(m.pubAgente, msg, sig) {
				responder(401, map[string]string{"erro": "CHAVE_INVALIDA"})
				return
			}
			responder(200, map[string]any{"modo": "adotar", "instalacao_id": m.inst, "servidor_id": tServidor, "canal": m.canal})
			return
		}
		if _, tem := corpo["agente_existente"]; tem {
			responder(401, map[string]string{"erro": "CHAVE_INVALIDA"})
			return
		}
		w.Header().Set("cache-control", "no-store")
		responder(200, map[string]any{"modo": "instalar", "instalacao_id": m.inst, "servidor_id": tServidor, "enroll_token": tEnrollToken, "canal": m.canal})
	case r.Method == "POST" && r.URL.Path == "/api/hermes/solicitacoes":
		if !estrito("cnpj", "fingerprint", "identificacao", "origem_identificacao", "versao_instalador") {
			return
		}
		responder(202, map[string]string{"protocolo": "HP-7K3QXM"})
	case r.Method == "GET" && r.URL.Path == "/api/agente/release":
		if r.URL.Query().Get("arch") != "amd64" {
			responder(400, map[string]string{"erro": "arch inválida"})
			return
		}
		responder(200, map[string]string{"versao": "0.7.0", "arch": "amd64", "sha256": m.shaMeta, "assinatura": m.assinMeta})
	case r.Method == "GET" && r.URL.Path == "/api/agente/binario":
		if r.Header.Get("X-RVLand-Enroll") != tEnrollToken || r.URL.Query().Get("versao") != "0.7.0" {
			responder(401, map[string]string{"erro": "download requer credencial"})
			return
		}
		w.Header().Set("x-rvland-versao", "0.7.0")
		w.Header().Set("x-rvland-sha256", m.hdrSha)
		_, _ = w.Write(m.bin)
	default:
		responder(404, map[string]string{"erro": "rota desconhecida no fake"})
	}
}

func (m *mundo) handlerIdent(w http.ResponseWriter, r *http.Request) {
	m.mu.Lock()
	m.identHdrs = append(m.identHdrs, r.Header.Clone())
	cod, corpo := m.identCod, m.identCorpo
	m.mu.Unlock()
	if r.URL.Path != "/SyncAutenticacao/identificacao-instalacao" || r.Header.Get("X-Hermes-Instalador") != "1" {
		w.WriteHeader(403)
		return
	}
	if cod != 200 {
		w.WriteHeader(cod)
		return
	}
	w.Header().Set("content-type", "application/json")
	_, _ = w.Write([]byte(corpo))
}

// ── executor fake ──

type fakeExec struct {
	m          *mundo
	mu         sync.Mutex
	chamadas   []Comando
	cancelados []bool // o ctx já estava cancelado quando o comando chegou
	falha      func(c Comando) *Resultado
	imagemRC   int
	// agente antigo: não anuncia --token-stdin (cai para --token=)
	agenteAntigo bool
	// efeito do enroll: "" normal; "conf-e-falha" grava conf+key válidos e sai 1; "so-chave" grava só a key e sai 1
	enrollEfeito string
	// docker cp: "link" troca hermes-imagem.sh por symlink; "dir" por diretório
	cpEfeito string
	// hermes-imagem: espera este canal antes de terminar (teste de concorrência)
	segurarImagem chan struct{}
	entrouImagem  chan struct{}
	dockerConfigs []string
}

func nomeBase(c Comando) string { return filepath.Base(c.Nome) }

func (f *fakeExec) linhas() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	var r []string
	for _, c := range f.chamadas {
		r = append(r, nomeBase(c)+" "+strings.Join(c.Args, " "))
	}
	return r
}

func (f *fakeExec) chamou(prefixo string) bool {
	for _, l := range f.linhas() {
		if strings.HasPrefix(l, prefixo) {
			return true
		}
	}
	return false
}

func (f *fakeExec) Executar(ctx context.Context, c Comando) Resultado {
	cancelado := ctx.Err() != nil
	f.mu.Lock()
	f.chamadas = append(f.chamadas, c)
	f.cancelados = append(f.cancelados, cancelado)
	for _, e := range c.Env {
		if strings.HasPrefix(e, "DOCKER_CONFIG=") {
			f.dockerConfigs = append(f.dockerConfigs, strings.TrimPrefix(e, "DOCKER_CONFIG="))
		}
	}
	falha := f.falha
	f.mu.Unlock()
	if cancelado {
		return Resultado{Codigo: -1, Err: ctx.Err()}
	}
	if falha != nil {
		if r := falha(c); r != nil {
			return *r
		}
	}
	m := f.m
	a := c.Args
	arg := func(i int) string {
		if i < len(a) {
			return a[i]
		}
		return ""
	}
	ok := func(s string) Resultado { return Resultado{Saida: []byte(s)} }
	switch nomeBase(c) {
	case "docker":
		switch arg(0) {
		case "version":
			return ok("27.3.1\n")
		case "compose":
			return ok("Docker Compose version v2.29.7\n")
		case "info":
			return ok("/var/lib/docker\n")
		case "login":
			if string(c.Stdin) != tSenhaReg || !temEnv(c, "DOCKER_CONFIG") {
				return Resultado{Codigo: 1, Saida: []byte("login recusado")}
			}
			return ok("Login Succeeded\n")
		case "logout", "pull", "rm":
			return ok("")
		case "image":
			return ok(tDigest + "\n")
		case "create":
			return ok(tCID + "\n")
		case "inspect":
			return Resultado{Codigo: 1, Saida: []byte("Error: No such object: hermes")}
		case "cp":
			dest := arg(2)
			for _, n := range opsArquivos {
				_ = os.WriteFile(filepath.Join(dest, n), []byte("#!/usr/bin/env bash\n# "+n+"\n"), 0o644)
			}
			alvo := filepath.Join(dest, "hermes-imagem.sh")
			switch f.cpEfeito {
			case "link":
				_ = os.Remove(alvo)
				_ = os.Symlink(filepath.Join(m.tmp, "fora-da-imagem.sh"), alvo)
			case "dir":
				_ = os.Remove(alvo)
				_ = os.Mkdir(alvo, 0o755)
			}
			return ok("")
		}
	case "bash":
		return ok("")
	case "systemctl", "nginx":
		return ok("")
	case "agenterv":
		switch arg(0) {
		case "ajuda":
			return Resultado{Codigo: 1, Saida: []byte("uso:\n  agenterv enroll ... --modo=hermes --instalacao=ID\n  agenterv hermes configurar --instalacao=ID\n")}
		case "enroll":
			if temArg(a, "--help") {
				if f.agenteAntigo {
					return Resultado{Codigo: 1, Saida: []byte("rvland-agent: --token é obrigatório")}
				}
				return Resultado{Codigo: 1, Saida: []byte("rvland-agent: token é obrigatório (--token-stdin, RVLAND_ENROLL_TOKEN ou --token=)")}
			}
			token := flagDe(a, "token")
			if temArg(a, "--token-stdin") {
				token = strings.TrimSpace(string(c.Stdin))
			} else if !f.agenteAntigo {
				return Resultado{Codigo: 1, Saida: []byte("harness: o agente novo exige o token no stdin")}
			}
			conf := map[string]any{"enderecos": []string{m.rv.URL}, "servidor_id": tServidor, "driver": "systemd", "modo": "hermes",
				"hermes": map[string]any{"instalacao_id": flagDe(a, "instalacao"), "canal": flagDe(a, "canal")}}
			if flagDe(a, "modo") != "hermes" || token != tEnrollToken {
				return Resultado{Codigo: 1, Saida: []byte("enroll falhou")}
			}
			b, _ := json.Marshal(conf)
			_ = os.MkdirAll(filepath.Join(m.raiz, "etc/rvland"), 0o755)
			if f.enrollEfeito != "so-chave" {
				_ = os.WriteFile(filepath.Join(m.raiz, "etc/rvland/agent.conf"), b, 0o644)
			}
			_ = os.WriteFile(filepath.Join(m.raiz, "etc/rvland/agente.key"), []byte("c2VlZA==\n"), 0o600)
			if f.enrollEfeito != "" {
				return Resultado{Codigo: 1, Saida: []byte("rvland-agent: salvar config: falha simulada depois do registro no RV")}
			}
			return ok("enrollment concluído\n")
		case "hermes":
			switch arg(1) {
			case "credencial":
				return ok(tUsuarioReg + "\n" + tSenhaReg + "\n")
			case "configurar":
				p := filepath.Join(m.raiz, "etc/rvland/agent.conf")
				b, _ := os.ReadFile(p)
				conf := map[string]any{}
				_ = json.Unmarshal(b, &conf)
				conf["hermes"] = map[string]any{"instalacao_id": flagDe(a, "instalacao"), "canal": flagDe(a, "canal")}
				nb, _ := json.Marshal(conf)
				_ = os.WriteFile(p, nb, 0o644)
				return ok("")
			}
		}
	case "hermes-imagem":
		if f.entrouImagem != nil {
			close(f.entrouImagem)
			<-f.segurarImagem
		}
		if f.imagemRC != 0 {
			// simula o que o hermes-imagem deixaria para trás antes de falhar
			_ = os.MkdirAll(filepath.Join(m.raiz, "var/lib/hermes"), 0o700)
			_ = os.WriteFile(filepath.Join(m.raiz, "var/lib/hermes/estado.json"), []byte("{}"), 0o600)
			return Resultado{Codigo: f.imagemRC, Saida: []byte("[ERRO] falhou\n")}
		}
		_ = os.MkdirAll(filepath.Join(m.raiz, "var/lib/hermes/licenca"), 0o755)
		_ = os.WriteFile(filepath.Join(m.raiz, "var/lib/hermes/estado.json"), []byte(`{"digest_atual":"x"}`), 0o600)
		if c.Saida != nil {
			_, _ = io.WriteString(c.Saida, "[OK] Hermes atualizado\n")
		}
		return ok("")
	}
	return Resultado{Codigo: 127, Saida: []byte("comando inesperado no fake: " + c.Nome + " " + strings.Join(a, " "))}
}

func temArg(args []string, alvo string) bool {
	for _, a := range args {
		if a == alvo {
			return true
		}
	}
	return false
}

func temEnv(c Comando, nome string) bool {
	for _, e := range c.Env {
		if strings.HasPrefix(e, nome+"=") {
			return true
		}
	}
	return false
}

func flagDe(args []string, nome string) string {
	for _, a := range args {
		if strings.HasPrefix(a, "--"+nome+"=") {
			return strings.TrimPrefix(a, "--"+nome+"=")
		}
	}
	return ""
}

// ── fotografia do sistema de arquivos (dry-run, idempotência, rollback) ──

type entradaFS struct {
	Modo fs.FileMode
	Hash string
	Link string
	Tipo string
}

func (m *mundo) foto(ignorar ...string) map[string]entradaFS {
	m.t.Helper()
	ignorar = append(ignorar, arqTrava)
	r := map[string]entradaFS{}
	_ = filepath.WalkDir(m.raiz, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel := "/" + strings.TrimPrefix(strings.TrimPrefix(p, m.raiz), "/")
		for _, ig := range ignorar {
			if rel == ig {
				return nil
			}
		}
		fi, _ := os.Lstat(p)
		e := entradaFS{Modo: fi.Mode()}
		switch {
		case fi.Mode()&os.ModeSymlink != 0:
			e.Tipo = "link"
			e.Link, _ = os.Readlink(p)
		case fi.IsDir():
			e.Tipo = "dir"
		default:
			e.Tipo = "arq"
			b, _ := os.ReadFile(p)
			h := sha256.Sum256(b)
			e.Hash = hex.EncodeToString(h[:])
		}
		r[rel] = e
		return nil
	})
	return r
}

func difFoto(a, b map[string]entradaFS) []string {
	var d []string
	for k, v := range a {
		if w, ok := b[k]; !ok {
			d = append(d, "sumiu: "+k)
		} else if v != w {
			d = append(d, fmt.Sprintf("mudou: %s (%v -> %v)", k, v, w))
		}
	}
	for k := range b {
		if _, ok := a[k]; !ok {
			d = append(d, "apareceu: "+k)
		}
	}
	sort.Strings(d)
	return d
}

// varre stdout/stderr, todos os arquivos da raiz e a forma EXIBÍVEL dos comandos atrás de segredos
func (m *mundo) semSegredos(extras ...string) {
	m.t.Helper()
	segredos := append([]string{tChave, tEnrollToken, tSenhaReg}, extras...)
	alvos := map[string]string{"stdout+stderr": m.saida()}
	_ = filepath.WalkDir(m.raiz, func(p string, d fs.DirEntry, err error) error {
		if err == nil && d.Type().IsRegular() {
			b, _ := os.ReadFile(p)
			alvos[p] = string(b)
		}
		return nil
	})
	for i, c := range m.exec.chamadas {
		alvos[fmt.Sprintf("exibicao de %s (#%d)", c.Nome, i)] = c.Exibir()
		// o ARGV e o ambiente REAIS do processo filho (visíveis no ps / /proc): nada de segredo
		alvos[fmt.Sprintf("argv/env de %s (#%d)", c.Nome, i)] = c.Nome + " " + strings.Join(c.Args, " ") + " " + strings.Join(c.Env, " ")
	}
	for onde, txt := range alvos {
		for _, s := range segredos {
			if strings.Contains(txt, s) {
				m.t.Errorf("segredo %q... vazou em %s", s[:8], onde)
			}
		}
		if strings.Contains(txt, "hmk_TESTE") {
			m.t.Errorf("chave hmk_ (parcial) vazou em %s", onde)
		}
	}
}
