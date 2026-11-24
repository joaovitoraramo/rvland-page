package main

import (
	"net"
	"testing"

	"rvland-agent/internal/hermesinst"
)

// O endereço padrão embutido precisa passar na própria validação do instalador (https puro).
func TestBaseURLPadraoValida(t *testing.T) {
	if _, err := hermesinst.ValidarBase(baseURL); err != nil {
		t.Fatalf("baseURL padrão %q inválida: %v", baseURL, err)
	}
}

func TestEscolherIPv4IgnoraPontesETuneis(t *testing.T) {
	ip := func(s string) []net.IP { return []net.IP{net.ParseIP(s)} }
	lista := []interfaceIP{
		{nome: "lo", ativa: true, loopback: true, ips: ip("127.0.0.1")},
		{nome: "docker0", ativa: true, ips: ip("172.17.0.1")},
		{nome: "br-1a2b", ativa: true, ips: ip("172.18.0.1")},
		{nome: "veth9", ativa: true, ips: ip("169.254.1.1")},
		{nome: "tailscale0", ativa: true, ips: ip("100.64.0.5")},
		{nome: "eth1", ativa: false, ips: ip("10.9.9.9")},
		{nome: "ens18", ativa: true, ips: []net.IP{net.ParseIP("fe80::1"), net.ParseIP("192.168.1.230")}},
	}
	if got := escolherIPv4(lista); got != "192.168.1.230" {
		t.Fatalf("escolherIPv4 = %q", got)
	}
	if got := escolherIPv4(lista[:5]); got != "" {
		t.Fatalf("só virtuais: %q", got)
	}
}
