// Comando hermesinstalador: instalador do Hermes (RVLand). Ver README.md nesta pasta.
//
// Build (scripts/publicar-instalador.ts):
//
//	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath \
//	  -ldflags "-s -w -X main.versao=X.Y.Z -X main.baseURL=https://rvland.com.br -X main.releasePK=<chaves/release.pub>" \
//	  ./hermesinstalador
package main

import (
	"context"
	"net"
	"os"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"

	"rvland-agent/internal/hermesinst"
)

// Injetados no build (-ldflags -X). O endereço do RVLand NÃO é configurável em tempo de
// execução: nada que venha da chave, de flag ou do ambiente vira URL.
var (
	versao    = "dev"
	baseURL   = "https://rvland.com.br"
	releasePK = ""
)

// ignorarSIGPIPE: escrita em pipe/terminal quebrado vira erro EPIPE (tratável) em vez de matar
// o processo no meio da transação ou do rollback.
func ignorarSIGPIPE() { signal.Ignore(syscall.SIGPIPE) }

func main() {
	ignorarSIGPIPE()
	hermesinst.UmaskRestritivo()
	ctx, parar := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
	defer parar()

	var terminal *os.File
	if f, err := os.OpenFile("/dev/tty", os.O_RDWR, 0); err == nil {
		terminal = f
		defer f.Close()
	}
	a := &hermesinst.Ambiente{
		Raiz:            "/",
		Stdout:          os.Stdout,
		Stderr:          os.Stderr,
		Stdin:           os.Stdin,
		Getenv:          os.Getenv,
		Unsetenv:        func(k string) { _ = os.Unsetenv(k) },
		Euid:            os.Geteuid(),
		Arch:            runtime.GOARCH,
		Exec:            hermesinst.ExecutorReal{},
		HTTPRV:          hermesinst.ClienteHTTPProducao(),
		HTTPLocal:       hermesinst.ClienteLoopback(),
		BaseURL:         baseURL,
		ReleasePK:       releasePK,
		Versao:          versao,
		SaudeURL:        "http://127.0.0.1:3000/api/saude",
		Agora:           time.Now,
		IPMaquina:       ipMaquina,
		Hostname:        os.Hostname,
		EspacoLivre:     hermesinst.EspacoLivre,
		Dormir:          time.Sleep,
		TempDir:         os.TempDir(),
		TentativasSaude: 6,
	}
	if terminal != nil {
		a.Terminal = terminal
	}
	os.Exit(hermesinst.Executar(ctx, os.Args[1:], a))
}

// ipMaquina: padrão do ALLOWED_HOST.
func ipMaquina() string {
	ifs, err := net.Interfaces()
	if err != nil {
		return ""
	}
	var lista []interfaceIP
	for _, it := range ifs {
		ii := interfaceIP{nome: it.Name, ativa: it.Flags&net.FlagUp != 0, loopback: it.Flags&net.FlagLoopback != 0}
		addrs, _ := it.Addrs()
		for _, ad := range addrs {
			if ipn, ok := ad.(*net.IPNet); ok {
				ii.ips = append(ii.ips, ipn.IP)
			}
		}
		lista = append(lista, ii)
	}
	return escolherIPv4(lista)
}

type interfaceIP struct {
	nome            string
	ativa, loopback bool
	ips             []net.IP
}

// interfaceVirtual: pontes/túneis que não são o endereço da máquina na rede da loja.
func interfaceVirtual(nome string) bool {
	if nome == "docker0" || nome == "tailscale0" {
		return true
	}
	for _, p := range []string{"br-", "veth", "virbr", "cni", "flannel"} {
		if strings.HasPrefix(nome, p) {
			return true
		}
	}
	return false
}

// escolherIPv4: primeiro IPv4 não link-local de uma interface ativa, física e sem loopback.
func escolherIPv4(ifs []interfaceIP) string {
	for _, it := range ifs {
		if !it.ativa || it.loopback || interfaceVirtual(it.nome) {
			continue
		}
		for _, ip := range it.ips {
			if v4 := ip.To4(); v4 != nil && !v4.IsLinkLocalUnicast() {
				return v4.String()
			}
		}
	}
	return ""
}
