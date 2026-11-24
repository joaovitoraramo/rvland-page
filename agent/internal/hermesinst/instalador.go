package hermesinst

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Ambiente: tudo que toca o sistema, injetável (raiz do FS, executor, HTTP, relógio...).
type Ambiente struct {
	Raiz            string
	Stdout, Stderr  io.Writer
	Stdin           io.Reader     // --chave-stdin
	Terminal        io.ReadWriter // /dev/tty; nil = sem terminal (não interativo)
	Getenv          func(string) string
	Unsetenv        func(string)
	Euid            int
	Arch            string
	Exec            Executor
	HTTPRV          *http.Client // RVLand (https)
	HTTPLocal       *http.Client // identificação/saúde (loopback, sem proxy)
	BaseURL         string
	ReleasePK       string
	Versao          string
	SaudeURL        string
	Agora           func() time.Time
	IPMaquina       func() string
	Hostname        func() (string, error)
	EspacoLivre     func(string) (uint64, error)
	Dormir          func(time.Duration)
	TempDir         string
	TentativasSaude int
}

type instalador struct {
	ctx    context.Context
	a      *Ambiente
	o      *Opcoes
	m      *Mascarador
	out    *EscritorMascarado
	errw   *EscritorMascarado
	rv     *clienteRV
	leitor *bufio.Reader
	tty    io.Writer
	chave  string
	// chave presente mas em formato inválido: só vira erro quando a chave for NECESSÁRIA
	chaveErro error

	txs     []*Transacao // transações abertas (o recover desfaz as não confirmadas)
	liberar func()       // trava de execução

	logMu    sync.Mutex
	logBuf   []string
	logArq   *os.File
	logFalho bool
}

// Executar roda o instalador e devolve o código de saída.
func Executar(ctx context.Context, args []string, a *Ambiente) (codigo int) {
	m := NovoMascarador()
	// a chave sai do ambiente ANTES de qualquer coisa (processos filhos não a herdam)
	chaveEnv := strings.TrimSpace(a.Getenv("HERMES_CHAVE"))
	if a.Getenv("HERMES_CHAVE") != "" {
		a.Unsetenv("HERMES_CHAVE")
	}
	m.Adicionar(chaveEnv)
	i := &instalador{ctx: ctx, a: a, m: m, out: m.Escritor(a.Stdout), errw: m.Escritor(a.Stderr)}
	defer i.fechar()
	defer func() { // a trava só é liberada DEPOIS do rollback de um pânico
		if i.liberar != nil {
			i.liberar()
		}
	}()
	defer func() {
		if r := recover(); r != nil {
			i.desfazerTodas()
			fmt.Fprintf(i.errw, "[ERRO] erro interno do instalador (%s); o que esta execução gravou foi desfeito\n", corta(textoLimpo(fmt.Sprint(r)), 200))
			i.registrar("[ERRO] pânico: " + fmt.Sprint(r))
			codigo = SaidaFalha
		}
	}()

	o := &Opcoes{}
	lerOpcoesAmbiente(o, a.Getenv)
	if err := lerArgs(args, o, i.out); err != nil {
		return i.terminar(err)
	}
	i.o = o
	if o.MostrarVersao {
		fmt.Fprintf(i.out, "hermesinstalador %s\n", a.Versao)
		return SaidaOK
	}
	base, err := ValidarBase(a.BaseURL)
	if err != nil {
		return i.terminar(falha(SaidaFalha, "%v", err))
	}
	i.rv = &clienteRV{base: base, http: a.HTTPRV, versao: a.Versao}
	if a.Terminal != nil && !o.NaoInterativo {
		i.leitor, i.tty = bufio.NewReader(a.Terminal), a.Terminal
	}
	if o.Modo == "instalar" || o.Modo == "adotar" {
		if i.chave, err = i.obterChave(chaveEnv); err != nil {
			if codigoDe(err) != SaidaChaveInvalida {
				return i.terminar(err)
			}
			i.chave, i.chaveErro = "", err // só falha se a chave for necessária (retomada não usa)
		}
	}
	return i.terminar(i.rodar())
}

func (i *instalador) rodar() error {
	switch i.o.Modo {
	case "identificacao":
		return i.mostrarIdentificacao()
	case "solicitar":
		return i.solicitar()
	case "instalar":
		return i.instalar()
	case "adotar":
		return i.adotar()
	}
	return falha(SaidaUso, "modo desconhecido")
}

// ── saída e log (tudo passa pelo mascarador) ──

func (i *instalador) registrar(linha string) {
	i.logMu.Lock()
	defer i.logMu.Unlock()
	l := i.a.Agora().UTC().Format(time.RFC3339) + " " + i.m.Mascarar(strings.TrimRight(linha, "\n")) + "\n"
	if i.logArq != nil {
		_, _ = i.logArq.WriteString(l)
		return
	}
	if len(i.logBuf) < 5000 {
		i.logBuf = append(i.logBuf, l)
	}
}

func (i *instalador) escrever(w io.Writer, prefixo, formato string, args ...any) {
	msg := fmt.Sprintf(formato, args...)
	fmt.Fprintf(w, "%s %s\n", prefixo, msg)
	i.registrar(prefixo + " " + msg)
}

func (i *instalador) info(f string, a ...any)  { i.escrever(i.out, "[INFO]", f, a...) }
func (i *instalador) ok(f string, a ...any)    { i.escrever(i.out, "[OK]  ", f, a...) }
func (i *instalador) aviso(f string, a ...any) { i.escrever(i.out, "[AVISO]", f, a...) }
func (i *instalador) plano(f string, a ...any) {
	fmt.Fprintf(i.out, "[DRY-RUN] faria: %s\n", fmt.Sprintf(f, a...))
}

// abrirLog: só a partir da primeira mudança no sistema (antes disso nada é gravado; as linhas
// ficam em memória e entram no log quando ele abre).
func (i *instalador) abrirLog() {
	i.logMu.Lock()
	defer i.logMu.Unlock()
	if i.logArq != nil || i.logFalho {
		return
	}
	if err := semSymlink(i.a.Raiz, arqLog); err == nil && ehDir(i.a.Raiz, filepath.Dir(arqLog)) {
		if f, err := abrirLogSemSeguirLink(real(i.a.Raiz, arqLog)); err == nil {
			i.logArq = f
			for _, l := range i.logBuf {
				_, _ = f.WriteString(l)
			}
			i.logBuf = nil
			return
		}
	}
	i.logFalho = true
	fmt.Fprintf(i.out, "[AVISO] não consegui abrir o log %s; seguindo só com a saída na tela\n", arqLog)
}

func (i *instalador) fechar() {
	i.out.Flush()
	i.errw.Flush()
	i.logMu.Lock()
	defer i.logMu.Unlock()
	if i.logArq != nil {
		_ = i.logArq.Close()
		i.logArq = nil
	}
}

func (i *instalador) terminar(err error) int {
	cod := codigoDe(err)
	if err != nil && err.Error() != "" {
		msg := err.Error()
		if cod == SaidaAguardandoChave {
			fmt.Fprintln(i.out, msg)
		} else {
			fmt.Fprintf(i.errw, "[ERRO] %s\n", msg)
		}
		i.registrar(fmt.Sprintf("[ERRO] (saida %d) %s", cod, msg))
	}
	return cod
}

// escritorComando: saída de um comando longo (hermes-imagem) na tela e no log, mascarada.
type funcWriter func(p []byte) (int, error)

func (f funcWriter) Write(p []byte) (int, error) { return f(p) }

func (i *instalador) escritorComando() *EscritorMascarado {
	return i.m.Escritor(funcWriter(func(p []byte) (int, error) {
		_, _ = i.a.Stdout.Write(p)
		i.registrar(string(p))
		return len(p), nil
	}))
}

func (i *instalador) executar(c Comando) Resultado {
	for _, s := range c.Segredos {
		i.m.Adicionar(s)
	}
	i.registrar("$ " + c.Exibir())
	return i.a.Exec.Executar(i.ctx, c)
}

// resumoSaida: a cauda da saída de um comando, mascarada e numa linha.
func (i *instalador) resumoSaida(r Resultado) string {
	s := strings.TrimSpace(string(r.Saida))
	if len(s) > 300 {
		s = "…" + s[len(s)-300:]
	}
	s = strings.ReplaceAll(s, "\n", " | ")
	if r.Err != nil {
		s = strings.TrimSpace(r.Err.Error() + " " + s)
	}
	if s == "" {
		s = fmt.Sprintf("código %d", r.Codigo)
	}
	return i.m.Mascarar(s)
}

// ── chave ──

func (i *instalador) obterChave(chaveEnv string) (string, error) {
	var c string
	switch {
	case i.o.Chave != "":
		i.m.Adicionar(i.o.Chave)
		i.aviso("a chave foi passada como argumento: ela fica visível no ps e no histórico do shell. Prefira --chave-arquivo, --chave-stdin ou HERMES_CHAVE.")
		c = i.o.Chave
	case i.o.ChaveArquivo != "":
		f, err := abrirLeituraSemSeguirLink(i.o.ChaveArquivo)
		if err != nil {
			return "", falha(SaidaUso, "--chave-arquivo: não abri (precisa ser arquivo regular, sem link simbólico)")
		}
		fi, err := f.Stat()
		if err != nil || !fi.Mode().IsRegular() || fi.Size() > 4096 {
			_ = f.Close()
			return "", falha(SaidaUso, "--chave-arquivo: precisa ser um arquivo regular pequeno (sem link simbólico)")
		}
		b, err := LerLimitado(f, 4096)
		_ = f.Close()
		if err != nil {
			return "", falha(SaidaUso, "--chave-arquivo: leitura falhou")
		}
		c = string(b)
	case i.o.ChaveStdin:
		if i.a.Stdin == nil {
			return "", falha(SaidaUso, "--chave-stdin sem entrada padrão")
		}
		b, _ := LerLimitado(io.LimitReader(i.a.Stdin, 4096), 4096)
		c, _, _ = strings.Cut(string(b), "\n")
	default:
		c = chaveEnv
	}
	c = strings.TrimSpace(c)
	if c == "" {
		return "", nil
	}
	i.m.Adicionar(c)
	if !FormatoChaveValido(c) {
		return "", falha(SaidaChaveInvalida, "chave em formato inválido (esperado hmk_ seguido de 43 caracteres); confira o link/chave do painel")
	}
	return c, nil
}

func (i *instalador) exigirChave() error {
	if i.chaveErro != nil {
		return i.chaveErro
	}
	if i.chave == "" {
		return falha(SaidaUso, "informe a chave (--chave-arquivo, --chave-stdin ou HERMES_CHAVE). Sem chave, use `hermesinstalador solicitar` para pedir uma à RVLand.")
	}
	return nil
}

// ── identificação, fingerprint e RVLand ──

func (i *instalador) cnpjEIdentificacao(porta string) (cnpj string, id *Identificacao, origem string, err error) {
	manual := ""
	if i.o.CNPJ != "" {
		manual = SoDigitos(i.o.CNPJ)
		if !CNPJValido(manual) {
			return "", nil, "", falha(SaidaUso, "CNPJ informado em --cnpj/HERMES_CNPJ é inválido")
		}
	}
	id, err = LerIdentificacao(i.ctx, i.a.HTTPLocal, porta)
	if err != nil {
		if manual != "" {
			i.aviso("identificação local indisponível (%v); usando o CNPJ informado", err)
			return manual, nil, "manual", nil
		}
		return "", nil, "", err
	}
	i.info("Identificação local: sistema %s, módulo %s, %d CNPJ(s).", corta(id.Sistema, 20), corta(id.VersaoModulo, 20), len(id.CNPJs))
	if manual != "" {
		for _, c := range id.CNPJs {
			if c == manual {
				return manual, id, "loopback", nil
			}
		}
		return "", nil, "", falha(SaidaUso, "o CNPJ informado não está entre os desta instalação (%s)", strings.Join(id.CNPJs, ", "))
	}
	raizes := map[string]bool{}
	for _, c := range id.CNPJs {
		raizes[RaizCNPJ(c)] = true
	}
	if len(raizes) > 1 {
		return "", nil, "", falha(SaidaUso, "esta instalação tem CNPJs de raízes diferentes (%s): informe qual usar com --cnpj", strings.Join(id.CNPJs, ", "))
	}
	return id.CNPJs[0], id, "loopback", nil
}

type fingerprint struct {
	MachineIDHash string `json:"machine_id_hash,omitempty"`
	BootID        string `json:"boot_id,omitempty"`
	HostnameHash  string `json:"hostname_hash,omitempty"`
	SO            string `json:"so,omitempty"`
	DockerVersao  string `json:"docker_versao,omitempty"`
}

var rePrettyName = regexp.MustCompile(`(?m)^PRETTY_NAME=["']?([^"'\n]*)`)

// fingerprint NUNCA grava. idNovo != "" = a máquina não tem machine-id: o id aleatório foi
// gerado em memória e só é persistido (persistirMachineID) depois da ativação aceita.
func (i *instalador) fingerprint(dockerVersao string) (fp fingerprint, idNovo string, err error) {
	mih, novo, err := MachineID(i.a.Raiz)
	if err != nil {
		return fp, "", falha(SaidaPreRequisito, "não consegui identificar a máquina: %v", err)
	}
	fp.MachineIDHash, idNovo = mih, novo
	if b, err := lerArquivo(i.a.Raiz, "/proc/sys/kernel/random/boot_id", 256); err == nil {
		fp.BootID = corta(strings.TrimSpace(string(b)), 64)
	}
	if h, err := i.a.Hostname(); err == nil && h != "" {
		fp.HostnameHash = sha256Hex([]byte(h))
	}
	so := "linux"
	if b, err := lerArquivo(i.a.Raiz, "/etc/os-release", 64*1024); err == nil {
		if m := rePrettyName.FindSubmatch(b); m != nil {
			so += " " + string(m[1])
		}
	}
	fp.SO = corta(so, 80)
	fp.DockerVersao = corta(dockerVersao, 40)
	return fp, idNovo, nil
}

// persistirIDNovo: depois da ativação aceita (o RV amarrou a chave a este machine_id_hash).
func (i *instalador) persistirIDNovo(idNovo string) error {
	if idNovo == "" {
		return nil
	}
	if err := persistirMachineID(i.a.Raiz, idNovo); err != nil {
		return falha(SaidaFalha, "não consegui gravar %s: %v", arqMachineIDAgente, err)
	}
	return nil
}

type corpoPublico struct {
	Chave         string         `json:"chave,omitempty"`
	CNPJ          string         `json:"cnpj"`
	Fingerprint   *fingerprint   `json:"fingerprint,omitempty"`
	Identificacao map[string]any `json:"identificacao,omitempty"`
	Origem        string         `json:"origem_identificacao,omitempty"`
	Versao        string         `json:"versao_instalador,omitempty"`
	Agente        *provaAgente   `json:"agente_existente,omitempty"`
}

type provaAgente struct {
	ServidorID string `json:"servidor_id"`
	Timestamp  string `json:"timestamp"`
	Assinatura string `json:"assinatura"`
}

func (i *instalador) corpo(cnpj string, fp *fingerprint, id *Identificacao, origem string) corpoPublico {
	if fp != nil && fp.MachineIDHash == "" {
		fp = nil
	}
	return corpoPublico{Chave: i.chave, CNPJ: cnpj, Fingerprint: fp, Identificacao: id.paraEnvio(), Origem: origem, Versao: corta(i.a.Versao, 40)}
}

func erroRV(r respostaRV) error {
	switch e := r.erro(); {
	case r.status == http.StatusUnauthorized:
		return falha(SaidaChaveInvalida, "chave inválida, expirada, já usada ou revogada (o RVLand não diz qual, por segurança). Peça uma chave nova no painel.")
	case r.status == http.StatusConflict && e == "CNPJ_DIVERGENTE":
		return falha(SaidaCNPJ, "CNPJ divergente: a raiz do CNPJ deste servidor não é a do cliente da chave. Confira o cliente no painel (a tentativa ficou registrada como suspeita).")
	case r.status == http.StatusUnprocessableEntity && e == "CNPJ_INVALIDO":
		return falha(SaidaCNPJ, "o RVLand recusou o CNPJ (inválido)")
	case r.status == http.StatusTooManyRequests:
		return falha(SaidaFalha, "limite de tentativas do RVLand atingido; tente de novo em 1 hora")
	default:
		return falha(SaidaFalha, "o RVLand respondeu HTTP %d %s", r.status, corta(e, 40))
	}
}

type respValidar struct {
	Tipo          string `json:"tipo"`
	ClienteNome   string `json:"cliente_nome"`
	CNPJMascarado string `json:"cnpj_mascarado"`
	Canal         string `json:"canal"`
	ExpiraEm      string `json:"expira_em"`
	InstalacaoID  string `json:"instalacao_id"` // contrato futuro: o painel mostra; hoje o validar não devolve
}

func (i *instalador) validar(c corpoPublico) (*respValidar, error) {
	r, err := i.rv.fazer(i.ctx, http.MethodPost, "/api/hermes/ativacao/validar", c, nil, maxRespostaJSON, timeoutAPI)
	if err != nil {
		return nil, falha(SaidaFalha, "%v", err)
	}
	if r.status != http.StatusOK {
		return nil, erroRV(r)
	}
	if t, err := http.ParseTime(r.hdr.Get("Date")); err == nil {
		if d := i.a.Agora().Sub(t); d > 2*time.Minute || d < -2*time.Minute {
			i.aviso("o relógio deste servidor difere %s do RVLand: confira o NTP (a prova de adoção exige ±5 min).", d.Round(time.Second))
		}
	}
	var v respValidar
	if json.Unmarshal(r.corpo, &v) != nil {
		return nil, falha(SaidaFalha, "resposta do validar fora do formato")
	}
	if !CanalValido(v.Canal) {
		v.Canal = "stable"
	}
	i.info("Chave válida (%s) para %q (CNPJ %s), canal %s, expira em %s.", v.Tipo, corta(textoLimpo(v.ClienteNome), 80), corta(v.CNPJMascarado, 24), v.Canal, corta(v.ExpiraEm, 30))
	return &v, nil
}

type respAtivacao struct {
	Modo         string `json:"modo"`
	InstalacaoID string `json:"instalacao_id"`
	ServidorID   string `json:"servidor_id"`
	EnrollToken  string `json:"enroll_token"`
	Canal        string `json:"canal"`
}

func (i *instalador) ativar(c corpoPublico, modo string) (*respAtivacao, error) {
	r, err := i.rv.fazer(i.ctx, http.MethodPost, "/api/hermes/ativacao", c, nil, maxRespostaJSON, timeoutAPI)
	if err != nil {
		return nil, falha(SaidaFalha, "%v (a chave pode ou não ter sido consumida; rodar de novo NESTA máquina em até 30 min é seguro)", err)
	}
	if r.status != http.StatusOK {
		return nil, erroRV(r)
	}
	var a respAtivacao
	if json.Unmarshal(r.corpo, &a) != nil {
		return nil, falha(SaidaFalha, "resposta da ativação fora do formato")
	}
	i.m.Adicionar(a.EnrollToken)
	a.InstalacaoID, a.ServidorID = strings.ToLower(a.InstalacaoID), strings.ToLower(a.ServidorID)
	if a.Modo != modo || !UUIDValido(a.InstalacaoID) || !UUIDValido(a.ServidorID) || !CanalValido(a.Canal) || (modo == "instalar" && a.EnrollToken == "") {
		return nil, falha(SaidaFalha, "resposta da ativação incompleta ou de outro modo (%q)", corta(a.Modo, 20))
	}
	return &a, nil
}

func textoLimpo(s string) string {
	return strings.Map(func(r rune) rune {
		if r < 0x20 || (r >= 0x7f && r <= 0x9f) {
			return ' '
		}
		return r
	}, s)
}

// ── pré-requisitos (somente leitura; qualquer falha = exit 6 sem mudar nada) ──

func (i *instalador) preRequisitos(destinos []string) (string, error) {
	var falhas []string
	if i.a.Euid != 0 {
		falhas = append(falhas, "execute como root (sudo)")
	}
	if !ehDir(i.a.Raiz, "/run/systemd/system") {
		falhas = append(falhas, "systemd não está ativo neste servidor: o agente RV roda como serviço systemd")
	}
	if i.a.Arch != "amd64" && i.a.Arch != "arm64" {
		falhas = append(falhas, "arquitetura não suportada ("+i.a.Arch+"): só amd64 e arm64")
	}
	dockerVersao := ""
	r := i.executar(Comando{Nome: "docker", Args: []string{"version", "--format", "{{.Server.Version}}"}, Timeout: 30 * time.Second})
	if !r.ok() {
		falhas = append(falhas, "docker não encontrado ou o daemon não responde (instale o Docker e rode `systemctl enable --now docker`)")
	} else {
		dockerVersao = strings.TrimSpace(string(r.Saida))
		if c := i.executar(Comando{Nome: "docker", Args: []string{"compose", "version"}, Timeout: 30 * time.Second}); !c.ok() {
			if c2 := i.executar(Comando{Nome: "docker-compose", Args: []string{"version"}, Timeout: 30 * time.Second}); !c2.ok() {
				falhas = append(falhas, "nem `docker compose` (plugin) nem `docker-compose` encontrados")
			}
		}
		dir := "/var/lib/docker"
		if inf := i.executar(Comando{Nome: "docker", Args: []string{"info", "--format", "{{.DockerRootDir}}"}, Timeout: 30 * time.Second}); inf.ok() {
			if d := strings.TrimSpace(string(inf.Saida)); strings.HasPrefix(d, "/") {
				dir = d
			}
		}
		livre, err := i.a.EspacoLivre(dir)
		if err != nil {
			livre, err = i.a.EspacoLivre("/")
		}
		if err != nil {
			falhas = append(falhas, "não consegui medir o espaço livre do Docker")
		} else if livre < minDiscoBytes {
			falhas = append(falhas, fmt.Sprintf("espaço livre insuficiente no disco do Docker (%s): %d MB, mínimo %d MB", dir, livre>>20, minDiscoBytes>>20))
		}
	}
	for _, d := range destinos {
		if err := semSymlink(i.a.Raiz, d); err != nil {
			falhas = append(falhas, fmt.Sprintf("%v (o instalador nunca segue links simbólicos)", err))
		}
	}
	if len(falhas) > 0 {
		return "", falha(SaidaPreRequisito, "pré-requisitos não atendidos (nada foi alterado):\n  - %s", strings.Join(falhas, "\n  - "))
	}
	i.ok("Pré-requisitos: root, systemd, docker %s, compose, %s, espaço em disco.", corta(dockerVersao, 20), i.a.Arch)
	return dockerVersao, nil
}

func destinosHermes(installDir string) []string {
	d := []string{arqConfig, arqModelo, arqHook, installDir + "/.env.production", installDir + "/docker-compose.imagem.yml",
		dirEstadoHermes, arqCron, "/etc/nginx/sites-available/hermes", "/etc/nginx/sites-enabled/hermes", "/etc/nginx/conf.d/hermes.conf", arqLog}
	for _, n := range opsScripts {
		d = append(d, dirBin+"/"+n)
	}
	return d
}

func destinosAgente() []string {
	return []string{arqAgente, arqAgenteConf, arqAgenteChave, "/var/lib/rvland/hermes-machine-id", arqUnit}
}

func (i *instalador) respostas(padroes *Respostas) (Respostas, error) {
	if i.leitor != nil {
		fmt.Fprintln(i.tty, "\nVamos configurar o .env.production do Hermes.")
	}
	return coletarRespostas(i.o, padroes, i.leitor, i.tty, i.a.IPMaquina())
}

// ── modos simples ──

func (i *instalador) portaIdentificacao() string {
	if i.o.WildflyPorta != "" {
		return LimparResposta(i.o.WildflyPorta)
	}
	if e, err := i.detectar(); err == nil && e.envExiste {
		if p := respostasDoEnv(e.envTexto).WildflyPorta; p != "" {
			return p
		}
	}
	return "8080"
}

func (i *instalador) mostrarIdentificacao() error {
	id, err := LerIdentificacao(i.ctx, i.a.HTTPLocal, i.portaIdentificacao())
	if err != nil {
		return err
	}
	b, _ := json.MarshalIndent(id, "", "  ")
	fmt.Fprintln(i.out, string(b))
	return nil
}

var reProtocolo = regexp.MustCompile(`^HP-[A-Z0-9]{4,12}$`)

func (i *instalador) solicitar() error {
	cnpj, id, origem, err := i.cnpjEIdentificacao(i.portaIdentificacao())
	if err != nil {
		return err
	}
	fp, novo, _ := i.fingerprint("")
	if novo != "" {
		fp.MachineIDHash = "" // id que não vai ser persistido não identifica a máquina
	}
	c := i.corpo(cnpj, &fp, id, origem)
	c.Chave = ""
	if i.o.DryRun {
		i.plano("enviar a solicitação de chave (CNPJ %s, origem %s) para %s/api/hermes/solicitacoes", cnpj, origem, i.rv.base)
		return nil
	}
	r, err := i.rv.fazer(i.ctx, http.MethodPost, "/api/hermes/solicitacoes", c, nil, maxRespostaJSON, timeoutAPI)
	if err != nil {
		return falha(SaidaFalha, "%v", err)
	}
	if r.status != http.StatusAccepted {
		return erroRV(r)
	}
	var p struct {
		Protocolo string `json:"protocolo"`
	}
	if json.Unmarshal(r.corpo, &p) != nil || !reProtocolo.MatchString(p.Protocolo) {
		return falha(SaidaFalha, "resposta da solicitação fora do formato")
	}
	return falha(SaidaAguardandoChave, "Solicitação registrada. Protocolo: %s\nInforme este protocolo à RVLand para receber a chave de instalação e rode o instalador de novo com a chave.", p.Protocolo)
}

func (i *instalador) desfazer(tx *Transacao) {
	n := tx.Pendentes()
	for _, err := range tx.Desfazer() {
		i.aviso("rollback: %v", err)
	}
	if n > 0 {
		i.info("Rollback feito (%d passo(s) desfeito(s)); nada que existia antes foi apagado.", n)
	}
}

// novaTx: transação registrada para o recover desfazer em caso de pânico.
func (i *instalador) novaTx() *Transacao {
	tx := NovaTransacao(i.a.Raiz)
	i.txs = append(i.txs, tx)
	return tx
}

func (i *instalador) desfazerTodas() {
	for k := len(i.txs) - 1; k >= 0; k-- {
		i.desfazer(i.txs[k])
	}
}

// executarLimpeza: limpeza/compensação roda mesmo depois de SIGINT/SIGTERM (contexto que não é
// cancelado pelo sinal, com prazo próprio).
func (i *instalador) executarLimpeza(c Comando) Resultado {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(i.ctx), 2*time.Minute)
	defer cancel()
	for _, s := range c.Segredos {
		i.m.Adicionar(s)
	}
	i.registrar("$ " + c.Exibir() + " (limpeza)")
	return i.a.Exec.Executar(ctx, c)
}

// travar: uma execução por vez (instalar/adotar; o dry-run não grava nada e não trava).
func (i *instalador) travar() error {
	if i.o.DryRun {
		return nil
	}
	if !ehDir(i.a.Raiz, filepath.Dir(arqTrava)) {
		return falha(SaidaPreRequisito, "%s não existe (systemd ativo?)", filepath.Dir(arqTrava))
	}
	if err := semSymlink(i.a.Raiz, arqTrava); err != nil {
		return falha(SaidaPreRequisito, "%v", err)
	}
	liberar, ocupada, err := travaExclusiva(real(i.a.Raiz, arqTrava))
	switch {
	case ocupada:
		return falha(SaidaPreRequisito, "outra execução do hermesinstalador está em andamento (trava %s); espere ela terminar", arqTrava)
	case err != nil:
		return falha(SaidaPreRequisito, "não consegui a trava %s (link simbólico ou sem permissão): %v", arqTrava, err)
	}
	i.liberar = liberar
	return nil
}

func (i *instalador) servicoAtivo() bool {
	return i.executar(Comando{Nome: "systemctl", Args: []string{"is-active", "--quiet", servicoAgente}, Timeout: 30 * time.Second}).ok()
}

func (i *instalador) conferirSaude() {
	for n := range max(i.a.TentativasSaude, 1) {
		if saudeOK(i.ctx, i.a.HTTPLocal, i.a.SaudeURL) {
			i.ok("Hermes respondendo em /api/saude.")
			return
		}
		if n+1 < i.a.TentativasSaude {
			i.a.Dormir(5 * time.Second)
		}
	}
	i.aviso("/api/saude não respondeu agora (o hermes-imagem já tinha validado a saúde). Confira: curl http://127.0.0.1:3000/api/saude")
}

func (i *instalador) resumo(titulo, instalacao, servidor, canal, host string) {
	if h, _, _ := strings.Cut(host, ","); h != "" {
		host = h
	}
	i.ok("%s", titulo)
	fmt.Fprintf(i.out, "  Instalação %s (servidor %s, canal %s)\n", instalacao, servidor, canal)
	fmt.Fprintf(i.out, "  Acesso:     http://%s\n", host)
	fmt.Fprintf(i.out, "  Agente:     systemctl status %s | agenterv hermes status\n", servicoAgente)
	fmt.Fprintf(i.out, "  Atualizar:  sudo hermes-update   (o canal vem do RV)\n")
	fmt.Fprintf(i.out, "  Log:        %s\n", arqLog)
	i.registrar(fmt.Sprintf("resumo: instalacao %s servidor %s canal %s", instalacao, servidor, canal))
}
