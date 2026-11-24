package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

const digestTeste = "sha256:" + "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

// fakeExec responde por comando (argv unido por espaço); registra as chamadas.
type fakeExec struct {
	mu        sync.Mutex
	respostas map[string]respFake
	chamadas  []string
}

type respFake struct {
	out    string
	stderr string
	err    error
}

func (f *fakeExec) exec(_ context.Context, nome string, args ...string) ([]byte, string, error) {
	cmd := strings.Join(append([]string{nome}, args...), " ")
	f.mu.Lock()
	f.chamadas = append(f.chamadas, cmd)
	r, ok := f.respostas[cmd]
	f.mu.Unlock()
	if !ok {
		return nil, "comando inesperado no teste: " + cmd, errors.New("exit status 1")
	}
	return []byte(r.out), r.stderr, r.err
}

const inspectRodando = `[{"State":{"Status":"running","Running":true,"StartedAt":"2026-11-23T19:21:03.123456789Z","Health":{"Status":"healthy"}},
 "Image":"sha256:aaaa","Config":{"Image":"ghcr.io/rvland-devs/hermes@` + digestTeste + `",
 "Labels":{"org.opencontainers.image.version":"0.14.26","org.opencontainers.image.revision":"f982d5a","org.aramo.hermes.licenca-chave":"real"},
 "Env":["PATH=/usr/bin","GIT_SHA=f982d5a"]}}]`

func driverTeste(t *testing.T, f *fakeExec) *driverDocker {
	t.Helper()
	dir := t.TempDir()
	return &driverDocker{
		exec:          f.exec,
		container:     "hermes",
		repo:          "ghcr.io/rvland-devs/hermes",
		arquivoModelo: filepath.Join(dir, "modelo"),
		arquivoEstado: filepath.Join(dir, "estado.json"),
		agora:         time.Now,
	}
}

func TestDocker_ObservaContainerRodando(t *testing.T) {
	f := &fakeExec{respostas: map[string]respFake{
		"docker inspect --type container hermes":      {out: inspectRodando},
		"docker version --format {{.Server.Version}}": {out: "29.6.1\n"},
	}}
	d := driverTeste(t, f)
	_ = os.WriteFile(d.arquivoModelo, []byte("imagem\n"), 0o644)
	_ = os.WriteFile(d.arquivoEstado, []byte("{\n  \"digest_atual\": \"x\",\n  \"canal\": \"preview\",\n  \"versao\": \"0.14.26\"\n}\n"), 0o600)

	i := d.Observar(context.Background())
	if i.Estado != "rodando" || i.Saude != "saudavel" || i.Versao != "0.14.26" || i.Sha != "f982d5a" {
		t.Fatalf("observação errada: %+v", i)
	}
	if i.Digest != digestTeste || i.CanalEmUso != "preview" || i.IniciadoEm != "2026-11-23T19:21:03.123Z" {
		t.Fatalf("digest/canal/início errados: %+v", i)
	}
	if !i.LabelConhecido || i.LicencaChave != "real" || i.DockerVersao != "29.6.1" {
		t.Fatalf("label/versão do docker errados: %+v", i)
	}
}

func TestDocker_DigestPelosRepoDigestsQuandoSubiuPorTag(t *testing.T) {
	insp := strings.Replace(inspectRodando, "ghcr.io/rvland-devs/hermes@"+digestTeste, "ghcr.io/rvland-devs/hermes:preview", 1)
	f := &fakeExec{respostas: map[string]respFake{
		"docker inspect --type container hermes":                          {out: insp},
		"docker image inspect --format {{json .RepoDigests}} sha256:aaaa": {out: `["outro/repo@sha256:` + strings.Repeat("f", 64) + `","ghcr.io/rvland-devs/hermes@` + digestTeste + `"]`},
		"docker version --format {{.Server.Version}}":                     {out: "18.09.7"},
	}}
	i := driverTeste(t, f).Observar(context.Background())
	if i.Digest != digestTeste {
		t.Fatalf("deveria escolher o digest do repositório do Hermes: %q", i.Digest)
	}
	// sem /etc/hermes/modelo = imagem, o canal em uso não é informado
	if i.CanalEmUso != "" {
		t.Fatalf("canal sem modelo imagem deveria ser vazio: %q", i.CanalEmUso)
	}
}

func TestDocker_EstadosSemDerrubarOAgente(t *testing.T) {
	casos := map[string]struct {
		r      respFake
		estado string
		saude  string
	}{
		"container ausente": {respFake{out: "[]", stderr: "Error: No such container: hermes", err: errors.New("exit status 1")}, "ausente", ""},
		"docker ausente":    {respFake{err: errors.New(`exec: "docker": executable file not found in $PATH`)}, "desconhecido", ""},
		"sem permissão":     {respFake{stderr: "permission denied while trying to connect to the Docker daemon socket", err: errors.New("exit status 1")}, "desconhecido", ""},
		"lixo":              {respFake{out: "{nao e json"}, "desconhecido", ""},
		"parado":            {respFake{out: `[{"State":{"Status":"exited","Running":false,"StartedAt":"0001-01-01T00:00:00Z"},"Config":{"Labels":{}}}]`}, "parado", "desconhecida"},
		"reiniciando":       {respFake{out: `[{"State":{"Status":"restarting","Health":{"Status":"unhealthy"}},"Config":{"Labels":null}}]`}, "parado", "nao_saudavel"},
		"iniciando":         {respFake{out: `[{"State":{"Status":"running","Health":{"Status":"starting"}},"Config":{}}]`}, "rodando", "iniciando"},
	}
	for nome, c := range casos {
		f := &fakeExec{respostas: map[string]respFake{
			"docker inspect --type container hermes":      c.r,
			"docker version --format {{.Server.Version}}": {err: errors.New("sem docker")},
		}}
		i := driverTeste(t, f).Observar(context.Background())
		if i.Estado != c.estado || i.Saude != c.saude {
			t.Errorf("%s: estado=%q saude=%q, esperado %q %q", nome, i.Estado, i.Saude, c.estado, c.saude)
		}
		if i.LabelConhecido && nome != "parado" && nome != "reiniciando" && nome != "iniciando" {
			t.Errorf("%s: label não pode ser conhecido sem inspect válido", nome)
		}
		if i.IniciadoEm != "" && nome == "parado" {
			t.Errorf("parado não tem iniciado_em: %q", i.IniciadoEm)
		}
	}
}

// ── hermes_update assíncrono ──

func TestAtualizador_UmPorVezEResultadoComoEvento(t *testing.T) {
	libera := make(chan struct{})
	var chamadas []string
	var mu sync.Mutex
	u := &atualizadorHermes{
		caminho: "/usr/local/bin/hermes-imagem",
		timeout: time.Minute,
		exec: func(ctx context.Context, nome string, args ...string) ([]byte, string, error) {
			mu.Lock()
			chamadas = append(chamadas, strings.Join(append([]string{nome}, args...), " "))
			mu.Unlock()
			<-libera
			return []byte("[INFO] Baixando...\n[OK]   Hermes atualizado (0.14.27, sha256:abc).\n"), "", nil
		},
	}
	if !u.Disparar("preview", digestTeste) {
		t.Fatal("primeiro disparo deveria iniciar")
	}
	if u.Disparar("preview", digestTeste) || u.Disparar("stable", "") {
		t.Fatal("mutex: só 1 atualização por vez")
	}
	if !u.Rodando() {
		t.Fatal("deveria estar rodando")
	}
	close(libera)
	evs := esperaEventos(t, u)
	if len(evs) != 1 || evs[0].Tipo != "hermes_update_ok" {
		t.Fatalf("esperado 1 hermes_update_ok: %+v", evs)
	}
	if evs[0].Dados["canal"] != "preview" || evs[0].Dados["rc"] != 0 {
		t.Fatalf("dados do evento: %+v", evs[0].Dados)
	}
	if len(chamadas) != 1 || chamadas[0] != "/usr/local/bin/hermes-imagem preview" {
		t.Fatalf("argv errado: %v", chamadas)
	}
	if u.Rodando() {
		t.Fatal("deveria ter terminado")
	}
	if !u.Disparar("stable", "") {
		t.Fatal("depois de terminar pode disparar de novo")
	}
	esperaEventos(t, u)
}

func TestAtualizador_FalhaSemSegredosNoLogETruncada(t *testing.T) {
	saida := strings.Repeat("linha comum de log\n", 500) +
		"Password: hunter2\nREG_SENHA=abc\ntoken=ghp_xxx\nAuthorization: Bearer zzz\n\x1b[0;31m[ERRO]\x1b[0m Falha no pull.\n"
	u := &atualizadorHermes{
		caminho: "/usr/local/bin/hermes-imagem",
		timeout: time.Minute,
		exec: func(ctx context.Context, nome string, args ...string) ([]byte, string, error) {
			return []byte(saida), "", errors.New("exit status 1")
		},
	}
	u.Disparar("stable", "")
	evs := esperaEventos(t, u)
	if len(evs) != 1 || evs[0].Tipo != "hermes_update_falhou" || evs[0].Severidade != "critico" {
		t.Fatalf("esperado hermes_update_falhou: %+v", evs)
	}
	tudo := evs[0].Mensagem + " " + evs[0].Dados["saida"].(string)
	for _, proibido := range []string{"hunter2", "abc", "ghp_xxx", "zzz", "\x1b["} {
		if strings.Contains(tudo, proibido) {
			t.Fatalf("saída do evento vazou %q", proibido)
		}
	}
	if len(evs[0].Dados["saida"].(string)) > 1500 || len(evs[0].Mensagem) > 300 {
		t.Fatal("saída deveria ser truncada")
	}
	if !strings.Contains(tudo, "Falha no pull") {
		t.Fatal("o fim da saída (a causa) deveria ficar no evento")
	}
}

func TestAtualizador_TimeoutECanalInvalido(t *testing.T) {
	u := &atualizadorHermes{
		caminho: "/usr/local/bin/hermes-imagem",
		timeout: 20 * time.Millisecond,
		exec: func(ctx context.Context, nome string, args ...string) ([]byte, string, error) {
			<-ctx.Done()
			return nil, "", ctx.Err()
		},
	}
	if u.Disparar("latest", "") || u.Disparar("", "") {
		t.Fatal("canal inválido nunca dispara")
	}
	u.Disparar("preview", "")
	evs := esperaEventos(t, u)
	if len(evs) != 1 || evs[0].Tipo != "hermes_update_falhou" || !strings.Contains(evs[0].Mensagem, "tempo") {
		t.Fatalf("timeout deveria virar falha: %+v", evs)
	}
}

func TestAtualizador_UsaScopeDoSystemdQuandoDisponivel(t *testing.T) {
	var argv string
	u := &atualizadorHermes{
		caminho:  "/usr/local/bin/hermes-imagem",
		timeout:  time.Minute,
		usaScope: func() bool { return true },
		exec: func(ctx context.Context, nome string, args ...string) ([]byte, string, error) {
			argv = strings.Join(append([]string{nome}, args...), " ")
			return nil, "", nil
		},
	}
	u.Disparar("preview", "")
	esperaEventos(t, u)
	// fora do cgroup do agente: reiniciar o agente (auto-update) não mata o hermes-imagem no meio do `up -d`
	if argv != "systemd-run --scope /usr/local/bin/hermes-imagem preview" {
		t.Fatalf("argv: %q", argv)
	}
}

func esperaEventos(t *testing.T, u *atualizadorHermes) []EventoHermes {
	t.Helper()
	fim := time.Now().Add(2 * time.Second)
	for time.Now().Before(fim) {
		if !u.Rodando() {
			return u.Drenar()
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatal("atualização não terminou")
	return nil
}
