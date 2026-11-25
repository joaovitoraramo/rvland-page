package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// versao e defaultEndereco são injetados no build via -ldflags.
var (
	versao          = "dev"
	defaultEndereco = "https://rvland.com.br"
)

// enderecoLegado é o alias antigo do painel na Vercel. Fica como último
// fallback por compatibilidade com agentes já instalados, que fizeram o enroll
// apontando para ele.
const enderecoLegado = "https://rvland-page.vercel.app"

func main() {
	if len(os.Args) < 2 {
		uso()
		os.Exit(1)
	}
	switch os.Args[1] {
	case "enroll":
		cmdEnroll(os.Args[2:])
	case "run":
		cmdRun()
	case "status":
		cmdStatus()
	case "reconnect":
		cmdReconnect()
	case "version":
		fmt.Println("rvland-agent", versao)
	case "logs":
		cmdLogs()
	case "hermes":
		cmdHermes(os.Args[2:])
	default:
		uso()
		os.Exit(1)
	}
}

func uso() {
	fmt.Println(`rvland-agent — agente da plataforma RVLand
uso:
  agenterv enroll --token=TOKEN --servidor=URL [--driver=systemd|dry] [--porta=7710]
  agenterv run          inicia o loop de heartbeat (rodar via systemd)
  agenterv status       mostra licença, serviços e último contato
  agenterv reconnect    força um heartbeat imediato
  agenterv version
  agenterv logs
  agenterv enroll ... --modo=hermes --instalacao=ID [--canal=stable|preview]   (servidor Hermes)
  agenterv hermes credencial   imprime usuário e senha do registro (hook do hermes-imagem)
  agenterv hermes sync|status  um ciclo de licença do Hermes / estado
  agenterv hermes configurar --instalacao=ID [--canal=...] [--modo=hermes]   (adoção)`)
}

func flagArg(args []string, nome string) string {
	p := "--" + nome + "="
	for _, a := range args {
		if strings.HasPrefix(a, p) {
			return strings.TrimPrefix(a, p)
		}
	}
	return ""
}

// envTokenEnroll é a variável de ambiente alternativa a --token= (o argv é
// visível a outros usuários via `ps`; o ambiente de um processo não é).
const envTokenEnroll = "RVLAND_ENROLL_TOKEN"

// resolveTokenEnroll escolhe a fonte do token do enroll. Precedência:
// --token-stdin > RVLAND_ENROLL_TOKEN > --token=. Fontes que divirjam são erro
// (as mensagens citam só os NOMES das fontes, nunca os valores). A variável de
// ambiente é removida do processo logo após a leitura. lookup/unset/stdin são
// injetados para teste.
func resolveTokenEnroll(args []string, lookup func(string) (string, bool), unset func(string) error, stdin func() (string, error)) (string, error) {
	type fonte struct{ nome, valor string }
	var fontes []fonte

	if contemArg(args, "--token-stdin") {
		v, err := stdin()
		if err != nil {
			return "", errors.New("--token-stdin: não foi possível ler o token do stdin")
		}
		if v == "" {
			return "", errors.New("--token-stdin: stdin vazio (esperado uma linha com o token)")
		}
		fontes = append(fontes, fonte{"--token-stdin", v})
	}
	if v, ok := lookup(envTokenEnroll); ok {
		_ = unset(envTokenEnroll) // o valor não deve ficar no ambiente do processo (nem herdado por filhos)
		if v = strings.TrimSpace(v); v != "" {
			fontes = append(fontes, fonte{envTokenEnroll, v})
		}
	}
	if v := strings.TrimSpace(flagArg(args, "token")); v != "" {
		fontes = append(fontes, fonte{"--token", v})
	}

	if len(fontes) == 0 {
		return "", errors.New("token é obrigatório (--token-stdin, " + envTokenEnroll + " ou --token=)")
	}
	for _, f := range fontes[1:] {
		if f.valor != fontes[0].valor {
			return "", errors.New("fontes de token divergentes (" + fontes[0].nome + " e " + f.nome + "): informe só uma")
		}
	}
	return fontes[0].valor, nil
}

func contemArg(args []string, alvo string) bool {
	for _, a := range args {
		if a == alvo {
			return true
		}
	}
	return false
}

// leTokenStdin lê uma linha do stdin. Em terminal, desliga o eco (stty -echo,
// best-effort) para o token não aparecer na tela.
func leTokenStdin() (string, error) {
	if fi, err := os.Stdin.Stat(); err == nil && fi.Mode()&os.ModeCharDevice != 0 {
		off := exec.Command("stty", "-echo")
		off.Stdin = os.Stdin
		if off.Run() == nil {
			defer func() {
				on := exec.Command("stty", "echo")
				on.Stdin = os.Stdin
				_ = on.Run()
				fmt.Fprintln(os.Stderr)
			}()
		}
	}
	return leLinhaToken(os.Stdin)
}

// maxTokenStdin é o teto (em bytes, sem o terminador de linha) do token lido do stdin.
const maxTokenStdin = 4096

func leLinhaToken(r io.Reader) (string, error) {
	// +2 deixa espaço para o terminador "\r\n" além do conteúdo máximo.
	linha, err := bufio.NewReader(io.LimitReader(r, maxTokenStdin+2)).ReadString('\n')
	if err != nil && err != io.EOF {
		return "", err
	}
	if len(strings.TrimRight(linha, "\r\n")) > maxTokenStdin {
		return "", errors.New("token do stdin excede o tamanho máximo")
	}
	return strings.TrimSpace(linha), nil
}

func enderecosDe(servidor string) []string {
	out := []string{}
	add := func(u string) {
		u = strings.TrimRight(u, "/")
		if u != "" && !contem(out, u) {
			out = append(out, u)
		}
	}
	add(servidor)
	add(defaultEndereco)
	add(enderecoLegado)
	return out
}

func cmdEnroll(args []string) {
	token, err := resolveTokenEnroll(args, os.LookupEnv, os.Unsetenv, leTokenStdin)
	if err != nil {
		fatal(err.Error())
	}
	servidor := flagArg(args, "servidor")
	driver := flagArg(args, "driver")
	if driver == "" {
		driver = "systemd"
	}
	porta := 0
	if p := flagArg(args, "porta"); p != "" {
		n, err := strconv.Atoi(p)
		if err != nil || n <= 0 || n > 65535 {
			fatal("--porta inválida")
		}
		porta = n
	}

	// modo Hermes (servidor criado por chave de instalação): valida antes de gastar o token
	hermes := flagArg(args, "modo") != "" || flagArg(args, "instalacao") != ""
	if hermes {
		if err := configurarHermes(&Config{}, args); err != nil {
			fatal(err.Error())
		}
	}

	seedB64, pubB64 := geraChaveAgente()
	host, _ := os.Hostname()
	so := runtime.GOOS

	enderecos := enderecosDe(servidor)
	var resp *RespEnroll
	err = tentaEnderecos(enderecos, func(base string) error {
		r, e := doEnroll(base, token, pubB64, host, so, versao)
		if e != nil {
			return e
		}
		resp = r
		return nil
	})
	if err != nil {
		fatal("enroll: " + err.Error())
	}

	cfg := &Config{
		Enderecos:     enderecos,
		ServidorID:    resp.ServidorID,
		Driver:        driver,
		PicpricePorta: porta,
		SeedB64:       seedB64,
	}
	if hermes {
		_ = configurarHermes(cfg, args) // já validado antes do enroll
	}
	if err := salvaConfig(cfg); err != nil {
		fatal("salvar config: " + err.Error())
	}
	if cfg.Modo == modoHermes {
		// servidor Hermes: sem lease do Credit, sem serviços, sem Pic Price
		logf("enrollment concluído — servidor %s (modo hermes, instalação %s)", resp.ServidorID, cfg.Hermes.InstalacaoID)
		return
	}

	// aplica o primeiro lease já (só se o módulo licença estiver ligado)
	if l, e := verificaLease(resp.Licenca); e == nil {
		aplicaSeLicenca(l, novoGerenciador(driver), carregaEstado())
		m := modulosDoLease(l)
		logf("módulos deste servidor: licença=%v picprice=%v", m.Licenca, m.Picprice)
	}
	logf("enrollment concluído — servidor %s", resp.ServidorID)
}

func montaCorpoHeartbeat(cfg *Config, lease *Lease, resultados []map[string]any) []byte {
	tel, up := coletaTelemetria()
	gs := novoGerenciador(cfg.Driver)

	servicos := []map[string]any{}
	if lease != nil && modulosDoLease(lease).Licenca {
		for _, u := range lease.ServicosLicenciados {
			ativo, _ := gs.Ativo(u)
			servicos = append(servicos, map[string]any{"unidade": u, "ativo": ativo})
		}
	}

	// nunca nil: slice nil vira `null` no JSON e o validador rejeita
	if resultados == nil {
		resultados = []map[string]any{}
	}

	corpo := map[string]any{
		"agente_versao":       versao,
		"uptime_seg":          up,
		"telemetria":          tel,
		"hardware":            coletaHardware(),
		"servicos":            servicos,
		"eventos":             []map[string]any{},
		"resultados_comandos": resultados,
	}
	b, _ := json.Marshal(corpo)
	return b
}

// executaComandos roda os verbos recebidos e devolve os resultados p/ o próximo beat.
func executaComandos(cfg *Config, cmds []ComandoPend) []map[string]any {
	gs := novoGerenciador(cfg.Driver)
	res := []map[string]any{}
	licenca := modulosDoLease(carregaEstado().Lease).Licenca
	for _, c := range cmds {
		estado := "concluido"
		saida := map[string]any{}
		if !licenca && (c.Verbo == "start" || c.Verbo == "stop") {
			res = append(res, map[string]any{"id": c.ID, "estado": "falhou", "saida": map[string]any{"erro": "módulo licença desligado neste servidor: o agente não gerencia serviços"}})
			continue
		}
		switch c.Verbo {
		case "status":
			ativo, _ := gs.Ativo(c.ServicoUnidade)
			texto, _ := gs.Status(c.ServicoUnidade)
			saida["ativo"] = ativo
			saida["texto"] = texto
		case "start":
			if e := gs.Start(c.ServicoUnidade); e != nil {
				estado, saida["erro"] = "falhou", e.Error()
			}
		case "stop":
			if e := gs.Stop(c.ServicoUnidade); e != nil {
				estado, saida["erro"] = "falhou", e.Error()
			}
		case "update":
			saida["nota"] = "update tratado via versao_alvo"
		default:
			estado, saida["erro"] = "falhou", "verbo desconhecido"
		}
		res = append(res, map[string]any{"id": c.ID, "estado": estado, "saida": saida})
	}
	return res
}

func umHeartbeat(cfg *Config, pendentes []map[string]any) ([]map[string]any, int) {
	est := carregaEstado()
	corpo := montaCorpoHeartbeat(cfg, est.Lease, pendentes)

	var resp *RespHeartbeat
	err := tentaEnderecos(cfg.Enderecos, func(base string) error {
		r, e := doHeartbeat(base, cfg.ServidorID, cfg.SeedB64, corpo)
		if e != nil {
			return e
		}
		resp = r
		return nil
	})
	if err != nil {
		logf("heartbeat falhou: %v — reaplicando último lease", err)
		if est.Lease != nil {
			aplicaSeLicenca(est.Lease, novoGerenciador(cfg.Driver), est)
		}
		return nil, 60
	}
	rt.registrarContato()

	if l, e := verificaLease(resp.Licenca); e == nil {
		aplicaSeLicenca(l, novoGerenciador(cfg.Driver), est)
	} else {
		logf("lease inválido no heartbeat: %v", e)
	}

	// auto-update (best-effort; se atualizar, o processo sai e reinicia)
	if err := autoAtualiza(cfg, resp.VersaoAlvo, versao); err != nil {
		logf("update: %v", err)
	}

	novos := executaComandos(cfg, resp.Comandos)
	iv := resp.IntervaloS
	if iv <= 0 {
		iv = 60
	}
	return novos, iv
}

func cmdRun() {
	cfg, err := carregaConfig()
	if err != nil {
		fatal("config: " + err.Error() + " (rode `agenterv enroll` primeiro)")
	}
	credit, hermes, _ := planoExecucao(cfg)
	if !credit {
		// modo Hermes: só o ciclo de licença do Hermes (sem heartbeat, lease, Pic Price ou comandos)
		logf("iniciando em modo hermes (servidor %s, v%s)", cfg.ServidorID, versao)
		iniciaHermes(cfg, true).loop()
		return
	}
	logf("iniciando (servidor %s, driver %s, v%s)", cfg.ServidorID, cfg.Driver, versao)
	if hermes {
		// servidor adotado: Credit como sempre + sync Hermes. iniciaHermes roda AQUI (antes das
		// goroutines) porque registra o adiamento do auto-update do Credit.
		ah := iniciaHermes(cfg, false)
		go ah.loop()
	}

	// Reforço imediato na subida: aplica o lease em cache antes do 1º heartbeat.
	// Se o último lease era bloqueado, garante o serviço parado/desabilitado já
	// no boot, sem depender da rede.
	if est := carregaEstado(); est.Lease != nil {
		aplicaSeLicenca(est.Lease, novoGerenciador(cfg.Driver), est)
	}

	// API local do RV Pic Price (127.0.0.1). Sobe sempre: com o módulo desligado
	// responde MODULO_DESATIVADO, e /v1/saude deixa o chamador descobrir o agente.
	go iniciaAPILocal(cfg)

	var pendentes []map[string]any
	for {
		novos, iv := umHeartbeat(cfg, pendentes)
		pendentes = novos // resultados vão no próximo beat
		if v := os.Getenv("RVLAND_INTERVALO"); v != "" {
			if n, e := strconv.Atoi(v); e == nil && n > 0 {
				iv = n // override para testes
			}
		}
		time.Sleep(time.Duration(iv) * time.Second)
	}
}

func cmdReconnect() {
	cfg, err := carregaConfig()
	if err != nil {
		fatal("config: " + err.Error())
	}
	if cfg.Modo == modoHermes {
		cmdHermes([]string{"sync"})
		return
	}
	umHeartbeat(cfg, nil)
	logf("reconnect concluído")
}

func cmdStatus() {
	cfg, err := carregaConfig()
	if err != nil {
		fatal("config: " + err.Error())
	}
	if cfg.Modo == modoHermes {
		fmt.Printf("servidor:   %s\n", cfg.ServidorID)
		fmt.Printf("endereços:  %s\n", strings.Join(cfg.Enderecos, ", "))
		fmt.Printf("versão:     %s\n", versao)
		statusHermes(cfg)
		return
	}
	est := carregaEstado()
	fmt.Printf("servidor:   %s\n", cfg.ServidorID)
	fmt.Printf("endereços:  %s\n", strings.Join(cfg.Enderecos, ", "))
	fmt.Printf("driver:     %s\n", cfg.Driver)
	fmt.Printf("versão:     %s\n", versao)
	mods := modulosDoLease(est.Lease)
	fmt.Printf("módulos:    licença=%v picprice=%v\n", mods.Licenca, mods.Picprice)
	if mods.Picprice {
		fmt.Printf("api local:  http://127.0.0.1:%d (RV Pic Price)\n", cfg.portaPicprice())
	}
	if est.Lease != nil && !mods.Licenca {
		fmt.Println("licença:    módulo desligado — o agente não para nem religa serviços")
	} else if est.Lease != nil {
		l := est.Lease
		fmt.Printf("licença:    %s (operar até %s)\n", l.Status, l.OperarAte)
		fmt.Printf("serviços:   %s\n", strings.Join(l.ServicosLicenciados, ", "))
		fmt.Printf("situação:   %s\n", situacaoLicenca(l, est.Bloqueados))
	} else {
		fmt.Println("licença:    (sem lease em cache — rode `agenterv reconnect`)")
	}
}

// situacaoLicenca descreve, para o `status`, o que está (ou estaria) acontecendo.
func situacaoLicenca(l *Lease, bloqueados []string) string {
	operarAte, err := time.Parse(time.RFC3339, l.OperarAte)
	venceu := err == nil && !time.Now().Before(operarAte)

	if l.Panico {
		return "operando — PÂNICO ativo (bloqueios suspensos na plataforma)"
	}
	if !venceu {
		return "operando normalmente (licença vigente)"
	}
	// operar_ate já passou
	if l.ModoSimulacao {
		return "MODO SIMULAÇÃO — SERIAM parados: " + juntar(l.ServicosLicenciados)
	}
	if len(bloqueados) > 0 {
		return "BLOQUEADO — parados e desabilitados: " + juntar(bloqueados)
	}
	return "BLOQUEADO (nenhum serviço licenciado a parar)"
}

func juntar(s []string) string {
	if len(s) == 0 {
		return "(nenhum)"
	}
	return strings.Join(s, ", ")
}

func cmdLogs() {
	if runtime.GOOS != "linux" {
		fmt.Println("logs disponíveis via journald no servidor Linux: journalctl -u rvland-agent -n 50")
		return
	}
	out, _ := exec.Command("journalctl", "-u", "rvland-agent", "-n", "50", "--no-pager").CombinedOutput()
	fmt.Print(string(out))
}

func fatal(msg string) {
	fmt.Fprintln(os.Stderr, "rvland-agent: "+msg)
	os.Exit(1)
}
