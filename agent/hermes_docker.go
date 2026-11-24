package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
)

// Driver Docker do modo Hermes (P9). Só a CLI `docker` (sem biblioteca nova) e só LEITURA do
// container `hermes`; quem troca a imagem é o /usr/local/bin/hermes-imagem (pull, fumaça,
// rollback). Docker ausente ou sem permissão = estado "desconhecido", nunca derruba o agente.

// execHermes roda um comando e devolve stdout, stderr e o erro (testes usam um fake).
type execHermes func(ctx context.Context, nome string, args ...string) ([]byte, string, error)

const (
	labelLicencaChave = "org.aramo.hermes.licenca-chave"
	// sha256 hex dos 32 bytes crus da chave pública h1 embutida na imagem (fpChaveHermes)
	labelLicencaChaveFP = "org.aramo.hermes.licenca-chave-fp"
	labelVersao         = "org.opencontainers.image.version"
	labelRevisao        = "org.opencontainers.image.revision"
	maxSaidaExec        = 64 * 1024
)

var reDigest = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)

// InfoContainer: o que vai em `container` do sync (+ o label da chave de licença).
type InfoContainer struct {
	Estado       string // rodando | parado | ausente | desconhecido
	Saude        string // saudavel | nao_saudavel | iniciando | desconhecida | "" (sem container)
	Versao       string
	Sha          string
	Digest       string
	CanalEmUso   string
	IniciadoEm   string
	LicencaChave string // valor do label org.aramo.hermes.licenca-chave ("real" | "placeholder" | ...)
	// LabelConhecido: o inspect do container funcionou (o label é confiável, mesmo se vazio).
	LabelConhecido bool
	DockerVersao   string
	LicencaChaveFP string // label org.aramo.hermes.licenca-chave-fp
	InstalacaoEnv  string // HERMES_INSTALACAO_ID do container ("" = não confere)
}

type driverDocker struct {
	exec          execHermes
	container     string
	repo          string
	arquivoModelo string // /etc/hermes/modelo ("imagem" = modo imagem)
	arquivoEstado string // /var/lib/hermes/estado.json (do hermes-imagem)
	agora         func() time.Time

	mu             sync.Mutex
	versaoDocker   string
	versaoDockerEm time.Time
}

type inspectContainer struct {
	State struct {
		Status    string `json:"Status"`
		Running   bool   `json:"Running"`
		StartedAt string `json:"StartedAt"`
		Health    *struct {
			Status string `json:"Status"`
		} `json:"Health"`
	} `json:"State"`
	Image  string `json:"Image"`
	Config struct {
		Image  string            `json:"Image"`
		Labels map[string]string `json:"Labels"`
		Env    []string          `json:"Env"`
	} `json:"Config"`
}

func envDe(env []string, nome string) string {
	for _, e := range env {
		if v, ok := strings.CutPrefix(e, nome+"="); ok {
			return v
		}
	}
	return ""
}

func (d *driverDocker) Observar(ctx context.Context) InfoContainer {
	i := InfoContainer{Estado: "desconhecido", DockerVersao: d.versaoDoDocker(ctx)}
	out, stderr, err := d.exec(ctx, "docker", "inspect", "--type", "container", d.container)
	if err != nil {
		msg := stderr + " " + err.Error()
		if strings.Contains(msg, "No such container") || strings.Contains(msg, "No such object") {
			i.Estado = "ausente"
		}
		return i
	}
	var lista []inspectContainer
	if json.Unmarshal(out, &lista) != nil {
		return i
	}
	if len(lista) == 0 {
		i.Estado = "ausente"
		return i
	}
	c := lista[0]
	i.LabelConhecido = true
	i.LicencaChave = c.Config.Labels[labelLicencaChave]
	i.LicencaChaveFP = c.Config.Labels[labelLicencaChaveFP]
	// o que o verificador do container usa (nucleo.mjs: process.env.HERMES_INSTALACAO_ID, com trim)
	i.InstalacaoEnv = trimJS(envDe(c.Config.Env, "HERMES_INSTALACAO_ID"))

	if c.State.Status == "running" {
		i.Estado = "rodando"
	} else {
		i.Estado = "parado"
	}
	i.Saude = "desconhecida"
	if c.State.Health != nil {
		switch c.State.Health.Status {
		case "healthy":
			i.Saude = "saudavel"
		case "unhealthy":
			i.Saude = "nao_saudavel"
		case "starting":
			i.Saude = "iniciando"
		}
	}
	i.Versao = c.Config.Labels[labelVersao]
	if i.Versao == "" {
		i.Versao = envDe(c.Config.Env, "HERMES_VERSAO")
	}
	i.Versao = corta(i.Versao, 40)
	i.Sha = c.Config.Labels[labelRevisao]
	if i.Sha == "" {
		i.Sha = envDe(c.Config.Env, "GIT_SHA")
	}
	i.Sha = corta(i.Sha, 64)
	if i.Estado == "rodando" {
		if t, err := time.Parse(time.RFC3339Nano, c.State.StartedAt); err == nil && t.Year() > 1 {
			i.IniciadoEm = formatoTs(t)
		}
	}
	i.Digest = d.digestDe(ctx, c)
	i.CanalEmUso = d.canalEmUso()
	return i
}

// digestDe: o hermes-imagem sobe por digest (Config.Image = repo@sha256:...); senão, RepoDigests.
func (d *driverDocker) digestDe(ctx context.Context, c inspectContainer) string {
	if _, dg, ok := strings.Cut(c.Config.Image, "@"); ok && reDigest.MatchString(dg) {
		return dg
	}
	if c.Image == "" {
		return ""
	}
	out, _, err := d.exec(ctx, "docker", "image", "inspect", "--format", "{{json .RepoDigests}}", c.Image)
	if err != nil {
		return ""
	}
	var rds []string
	if json.Unmarshal(bytes.TrimSpace(out), &rds) != nil {
		return ""
	}
	escolhido := ""
	for _, r := range rds {
		repo, dg, ok := strings.Cut(r, "@")
		if !ok || !reDigest.MatchString(dg) {
			continue
		}
		if repo == d.repo {
			return dg
		}
		if escolhido == "" {
			escolhido = dg
		}
	}
	return escolhido
}

// canalEmUso: só no modo imagem (/etc/hermes/modelo = imagem), o canal gravado pelo hermes-imagem.
func (d *driverDocker) canalEmUso() string {
	m, err := os.ReadFile(d.arquivoModelo)
	if err != nil || strings.TrimSpace(string(m)) != "imagem" {
		return ""
	}
	b, err := os.ReadFile(d.arquivoEstado)
	if err != nil {
		return ""
	}
	var e struct {
		Canal string `json:"canal"`
	}
	if json.Unmarshal(b, &e) != nil || !canalValido(e.Canal) {
		return ""
	}
	return e.Canal
}

func (d *driverDocker) versaoDoDocker(ctx context.Context) string {
	d.mu.Lock()
	defer d.mu.Unlock()
	agora := d.agora()
	if !d.versaoDockerEm.IsZero() && agora.Sub(d.versaoDockerEm) < time.Hour {
		return d.versaoDocker
	}
	out, _, err := d.exec(ctx, "docker", "version", "--format", "{{.Server.Version}}")
	d.versaoDockerEm = agora
	d.versaoDocker = ""
	if err == nil {
		d.versaoDocker = corta(strings.TrimSpace(string(out)), 40)
	}
	return d.versaoDocker
}

// ── execução real ──

// caudaBuffer guarda só os últimos `max` bytes escritos (stderr do docker, para diagnóstico).
type caudaBuffer struct {
	b   []byte
	max int
}

func (c *caudaBuffer) Write(p []byte) (int, error) {
	c.b = append(c.b, p...)
	if len(c.b) > c.max {
		c.b = append([]byte(nil), c.b[len(c.b)-c.max:]...)
	}
	return len(p), nil
}

// bufLimitado guarda a saída INTEIRA (JSON do inspect não pode ser cortado) até um teto de
// segurança; passou do teto = erro (nunca JSON truncado).
type bufLimitado struct {
	b       []byte
	max     int
	estouro bool
}

func (c *bufLimitado) Write(p []byte) (int, error) {
	if len(c.b)+len(p) > c.max {
		c.estouro = true
		return len(p), nil // continua drenando: o processo nunca bloqueia nem recebe erro de escrita
	}
	c.b = append(c.b, p...)
	return len(p), nil
}

// executorProcesso roda um comando num GRUPO de processos próprio. No cancelamento (timeout):
// SIGTERM ao grupo (o hermes-imagem roda o `trap limpar`: logout do registro e limpeza), espera
// `graca` e então SIGKILL ao grupo (inclusive órfãos, como um `docker pull`).
//
// arquivo=true (hermes-imagem): stdout/stderr vão para um arquivo temporário 0600, NÃO para um
// pipe do agente: se o agente morrer/reiniciar no meio, o update não leva SIGPIPE. Devolve a
// CAUDA (64 KB) no 1º valor e o INÍCIO (4 KB) no 2º; o arquivo é apagado.
type executorProcesso struct {
	arquivo  bool
	dirTemp  string
	graca    time.Duration
	maxSaida int
	observa  func(s syscall.Signal) // testes: registra os sinais enviados
}

func (e executorProcesso) sinalGrupo(pid int, s syscall.Signal) {
	if e.observa != nil {
		e.observa(s)
	}
	_ = syscall.Kill(-pid, s)
}

func (e executorProcesso) exec(ctx context.Context, nome string, args ...string) ([]byte, string, error) {
	cmd := exec.Command(nome, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	var arq *os.File
	out := &bufLimitado{max: e.maxSaida}
	errb := &caudaBuffer{max: 8 * 1024}
	if e.arquivo {
		f, err := os.CreateTemp(e.dirTemp, prefixoSaidaUpdate+"*.log")
		if err != nil {
			return nil, "", fmt.Errorf("não consegui criar o arquivo de saída do %s (disco cheio?): %w", filepath.Base(nome), err)
		}
		arq = f
		defer func() {
			_ = f.Close()
			_ = os.Remove(f.Name())
		}()
		cmd.Stdout, cmd.Stderr = f, f
	} else {
		if out.max <= 0 {
			out.max = 8 << 20
		}
		cmd.Stdout, cmd.Stderr = out, errb
	}
	if err := cmd.Start(); err != nil {
		return nil, "", err
	}
	pid := cmd.Process.Pid
	fim := make(chan error, 1)
	go func() { fim <- cmd.Wait() }()

	var err error
	select {
	case err = <-fim:
	case <-ctx.Done():
		e.sinalGrupo(pid, syscall.SIGTERM)
		recebido := false
		select {
		case err = <-fim:
			recebido = true
		case <-time.After(e.graca):
		}
		e.sinalGrupo(pid, syscall.SIGKILL) // o que restou no grupo (órfãos ou quem ignorou o TERM)
		if !recebido {
			err = <-fim
		}
	}

	if e.arquivo {
		return caudaArquivo(arq, maxSaidaExec), string(inicioArquivo(arq, 4096)), err
	}
	if out.estouro {
		return nil, string(errb.b), fmt.Errorf("saída de %s maior que %d bytes", nome, out.max)
	}
	return out.b, string(errb.b), err
}

func caudaArquivo(f *os.File, n int64) []byte {
	st, err := f.Stat()
	if err != nil {
		return nil
	}
	ini := max(st.Size()-n, 0)
	b := make([]byte, st.Size()-ini)
	k, _ := f.ReadAt(b, ini)
	return b[:k]
}

func inicioArquivo(f *os.File, n int) []byte {
	b := make([]byte, n)
	k, _ := f.ReadAt(b, 0)
	return b[:k]
}

// prefixoSaidaUpdate: arquivos temporários de saída do hermes-imagem (limpos na inicialização).
const prefixoSaidaUpdate = "rvland-hermes-imagem-"

// limpaSaidasAntigas apaga restos de execuções anteriores (o agente pode ter morrido antes do
// defer): só arquivos REGULARES com o prefixo próprio, do próprio uid e com mais de 1 h.
func limpaSaidasAntigas(dir string, agora time.Time) {
	limpaSaidasAntigasDoUID(dir, agora, os.Getuid())
}

func limpaSaidasAntigasDoUID(dir string, agora time.Time, uid int) {
	if dir == "" {
		dir = os.TempDir()
	}
	ents, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range ents {
		if !strings.HasPrefix(e.Name(), prefixoSaidaUpdate) {
			continue
		}
		p := filepath.Join(dir, e.Name())
		st, err := os.Lstat(p)
		if err != nil || !st.Mode().IsRegular() || agora.Sub(st.ModTime()) < time.Hour {
			continue
		}
		if sys, ok := st.Sys().(*syscall.Stat_t); !ok || int(sys.Uid) != uid {
			continue
		}
		_ = os.Remove(p)
	}
}

var (
	execInspect = executorProcesso{maxSaida: 8 << 20, graca: 5 * time.Second}.exec
	execUpdate  = executorProcesso{arquivo: true, graca: 30 * time.Second}.exec
)

// ── hermes_update assíncrono ──

// atualizadorHermes roda o hermes-imagem em UMA goroutine por vez; o resultado vira um
// evento hermes_update_ok/falhou entregue no próximo sync.
type atualizadorHermes struct {
	caminho  string
	timeout  time.Duration
	exec     execHermes
	usaScope func() bool

	mu         sync.Mutex
	rodando    bool
	resultados []EventoHermes
}

func scopeSystemdDisponivel() bool {
	if runtime.GOOS != "linux" {
		return false
	}
	if st, err := os.Stat("/run/systemd/system"); err != nil || !st.IsDir() {
		return false
	}
	_, err := exec.LookPath("systemd-run")
	return err == nil
}

func (u *atualizadorHermes) Rodando() bool {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.rodando
}

// Drenar devolve (e limpa) os eventos de atualizações já terminadas.
func (u *atualizadorHermes) Drenar() []EventoHermes {
	u.mu.Lock()
	defer u.mu.Unlock()
	r := u.resultados
	u.resultados = nil
	return r
}

// Disparar inicia `hermes-imagem <canal>` em segundo plano. false = já há uma rodando ou canal inválido.
func (u *atualizadorHermes) Disparar(canal, digestAlvo string) bool {
	if !canalValido(canal) {
		return false
	}
	u.mu.Lock()
	if u.rodando {
		u.mu.Unlock()
		return false
	}
	u.rodando = true
	u.mu.Unlock()
	go u.executar(canal, digestAlvo)
	return true
}

func (u *atualizadorHermes) executar(canal, digestAlvo string) {
	ev := EventoHermes{Tipo: "hermes_update_falhou", Severidade: "critico"}
	defer func() {
		if r := recover(); r != nil {
			ev = EventoHermes{Tipo: "hermes_update_falhou", Severidade: "critico", Mensagem: "falha interna do agente ao atualizar o Hermes"}
		}
		u.mu.Lock()
		u.resultados = append(u.resultados, ev)
		u.rodando = false
		u.mu.Unlock()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), u.timeout)
	defer cancel()
	inicio := time.Now()
	logf("hermes: atualizando o container (hermes-imagem %s)...", canal)
	var out []byte
	var cabeca string
	var err error
	direto := true
	if u.usaScope != nil && u.usaScope() {
		// escopo próprio do systemd: reiniciar o agente não mata o hermes-imagem no meio do `up -d`
		out, cabeca, err = u.exec(ctx, "systemd-run", "--scope", u.caminho, canal)
		direto = err != nil && ctx.Err() == nil && scopeNaoSubiu(cabeca, string(out), err)
		if direto {
			logf("hermes: systemd-run --scope indisponível (%s); executando o hermes-imagem direto", ultimaLinha(saidaSegura(string(out)+"\n"+err.Error())))
		}
	}
	if direto {
		out, cabeca, err = u.exec(ctx, u.caminho, canal)
	}
	dur := time.Since(inicio).Round(time.Second)
	saida := string(out)
	if err != nil && len(out) == 0 {
		saida = err.Error() // ex.: não conseguiu criar o arquivo de saída / iniciar o processo
	}
	saida = saidaSegura(saida)

	rc := 0
	if err != nil {
		rc = -1
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			rc = ee.ExitCode()
		}
	}
	dados := map[string]any{"canal": canal, "rc": rc, "duracao_s": int(dur.Seconds())}
	if digestAlvo != "" {
		dados["digest_alvo"] = digestAlvo
	}
	switch {
	case ctx.Err() == context.DeadlineExceeded:
		ev.Mensagem = fmt.Sprintf("hermes-imagem %s excedeu o tempo limite (%s) e foi interrompido", canal, u.timeout)
	case err != nil:
		ev.Mensagem = corta(fmt.Sprintf("hermes-imagem %s falhou (rc %d): %s", canal, rc, ultimaLinha(saida)), 300)
	default:
		ev = EventoHermes{Tipo: "hermes_update_ok", Severidade: "info",
			Mensagem: corta(fmt.Sprintf("hermes-imagem %s concluído: %s", canal, ultimaLinha(saida)), 300)}
	}
	dados["saida"] = cauda(saida, 1500)
	ev.Dados = dados
	logf("hermes: %s", ev.Mensagem)
}

// scopeNaoSubiu: o systemd-run falhou ANTES de executar o hermes-imagem (sem dbus/systemd, LXC,
// binário ausente): só nesse caso é seguro executar de novo, direto. "Running scope as unit" é
// procurado no INÍCIO da saída (a cauda pode não tê-lo); o erro do Start entra no texto avaliado.
func scopeNaoSubiu(inicio, cauda string, err error) bool {
	if inicio == "" {
		inicio = cauda
	}
	if strings.Contains(inicio, "Running scope as unit") {
		return false
	}
	return reScopeFalhou.MatchString(inicio + "\n" + cauda + "\n" + err.Error())
}

var (
	reScopeFalhou = regexp.MustCompile(`(?i)failed to (create bus connection|connect to bus|start transient scope|create scope|allocate)|unknown option|unrecognized option|systemd-run: not found|executable file not found`)
	reAnsi        = regexp.MustCompile(`\x1b\[[0-9;?]*[A-Za-z]`)
	reSegredo     = regexp.MustCompile(`(?i)(senha|password|passwd|secret|token|authorization|bearer|credencial|REG_SENHA)`)
	reControle    = regexp.MustCompile(`[\x00-\x08\x0b-\x1f\x7f]`)
)

// saidaSegura tira cores/controle e OMITE qualquer linha que possa citar segredo.
func saidaSegura(s string) string {
	s = reAnsi.ReplaceAllString(s, "")
	s = reControle.ReplaceAllString(s, "")
	linhas := strings.Split(s, "\n")
	out := linhas[:0]
	for _, l := range linhas {
		l = strings.TrimRight(l, " \t")
		if l == "" {
			continue
		}
		if reSegredo.MatchString(l) {
			l = "[linha omitida pelo agente]"
		}
		out = append(out, l)
	}
	return strings.Join(out, "\n")
}

func ultimaLinha(s string) string {
	if i := strings.LastIndexByte(s, '\n'); i >= 0 {
		return s[i+1:]
	}
	return s
}

// cauda: os últimos n bytes (sem partir caractere UTF-8).
func cauda(s string, n int) string {
	if len(s) <= n {
		return s
	}
	i := len(s) - n
	for i < len(s) && s[i]&0xC0 == 0x80 {
		i++
	}
	return s[i:]
}
