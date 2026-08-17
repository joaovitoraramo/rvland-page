package main

import (
	"encoding/json"
	"fmt"
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
	defaultEndereco = "https://rvland-page.vercel.app"
)

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
	default:
		uso()
		os.Exit(1)
	}
}

func uso() {
	fmt.Println(`rvland-agent — agente da plataforma RVLand
uso:
  agenterv enroll --token=TOKEN --servidor=URL [--driver=systemd|dry]
  agenterv run          inicia o loop de heartbeat (rodar via systemd)
  agenterv status       mostra licença, serviços e último contato
  agenterv reconnect    força um heartbeat imediato
  agenterv version
  agenterv logs`)
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
	return out
}

func cmdEnroll(args []string) {
	token := flagArg(args, "token")
	servidor := flagArg(args, "servidor")
	driver := flagArg(args, "driver")
	if driver == "" {
		driver = "systemd"
	}
	if token == "" {
		fatal("--token é obrigatório")
	}

	seedB64, pubB64 := geraChaveAgente()
	host, _ := os.Hostname()
	so := runtime.GOOS

	enderecos := enderecosDe(servidor)
	var resp *RespEnroll
	err := tentaEnderecos(enderecos, func(base string) error {
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
		Enderecos:  enderecos,
		ServidorID: resp.ServidorID,
		Driver:     driver,
		SeedB64:    seedB64,
	}
	if err := salvaConfig(cfg); err != nil {
		fatal("salvar config: " + err.Error())
	}

	// aplica o primeiro lease já
	if l, e := verificaLease(resp.Licenca); e == nil {
		aplicaLease(l, novoGerenciador(driver), carregaEstado())
	}
	logf("enrollment concluído — servidor %s", resp.ServidorID)
}

func montaCorpoHeartbeat(cfg *Config, lease *Lease, resultados []map[string]any) []byte {
	tel, up := coletaTelemetria()
	gs := novoGerenciador(cfg.Driver)

	servicos := []map[string]any{}
	if lease != nil {
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
	for _, c := range cmds {
		estado := "concluido"
		saida := map[string]any{}
		switch c.Verbo {
		case "status":
			ativo, _ := gs.Ativo(c.ServicoUnidade)
			saida["ativo"] = ativo
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
			aplicaLease(est.Lease, novoGerenciador(cfg.Driver), est)
		}
		return nil, 60
	}

	if l, e := verificaLease(resp.Licenca); e == nil {
		aplicaLease(l, novoGerenciador(cfg.Driver), est)
	} else {
		logf("lease inválido no heartbeat: %v", e)
	}

	// auto-update (best-effort; se atualizar, o processo sai e reinicia)
	base := cfg.Enderecos[0]
	if err := autoAtualiza(base, resp.VersaoAlvo, versao); err != nil {
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
	logf("iniciando (servidor %s, driver %s, v%s)", cfg.ServidorID, cfg.Driver, versao)

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
	umHeartbeat(cfg, nil)
	logf("reconnect concluído")
}

func cmdStatus() {
	cfg, err := carregaConfig()
	if err != nil {
		fatal("config: " + err.Error())
	}
	est := carregaEstado()
	fmt.Printf("servidor:   %s\n", cfg.ServidorID)
	fmt.Printf("endereços:  %s\n", strings.Join(cfg.Enderecos, ", "))
	fmt.Printf("driver:     %s\n", cfg.Driver)
	fmt.Printf("versão:     %s\n", versao)
	if est.Lease != nil {
		fmt.Printf("licença:    %s (operar até %s)\n", est.Lease.Status, est.Lease.OperarAte)
		fmt.Printf("serviços:   %s\n", strings.Join(est.Lease.ServicosLicenciados, ", "))
		if len(est.Bloqueados) > 0 {
			fmt.Printf("bloqueados: %s\n", strings.Join(est.Bloqueados, ", "))
		}
	} else {
		fmt.Println("licença:    (sem lease em cache)")
	}
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
