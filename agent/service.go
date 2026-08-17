package main

import (
	"fmt"
	"os/exec"
	"strings"
	"sync"
)

// GerenciadorServico abstrai o systemd para o agente ser testável fora de Linux.
type GerenciadorServico interface {
	Ativo(unidade string) (bool, error)
	Start(unidade string) error
	Stop(unidade string) error
}

func novoGerenciador(driver string) GerenciadorServico {
	if driver == "dry" {
		return &gerenciadorDry{estado: map[string]bool{}}
	}
	return &gerenciadorSystemd{}
}

// ── systemd real ──
type gerenciadorSystemd struct{}

func (g *gerenciadorSystemd) Ativo(unidade string) (bool, error) {
	out, _ := exec.Command("systemctl", "is-active", unidade).Output()
	return strings.TrimSpace(string(out)) == "active", nil
}
func (g *gerenciadorSystemd) Start(unidade string) error {
	return exec.Command("systemctl", "start", unidade).Run()
}
func (g *gerenciadorSystemd) Stop(unidade string) error {
	return exec.Command("systemctl", "stop", unidade).Run()
}

// ── dry: registra a intenção e simula estado (dev/macOS) ──
type gerenciadorDry struct {
	mu     sync.Mutex
	estado map[string]bool
}

func (g *gerenciadorDry) Ativo(unidade string) (bool, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if _, ok := g.estado[unidade]; !ok {
		g.estado[unidade] = true // assume rodando na primeira vez
	}
	return g.estado[unidade], nil
}
func (g *gerenciadorDry) Start(unidade string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.estado[unidade] = true
	logf("[dry] systemctl start %s", unidade)
	return nil
}
func (g *gerenciadorDry) Stop(unidade string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.estado[unidade] = false
	logf("[dry] systemctl stop %s", unidade)
	return nil
}

func logf(f string, a ...any) {
	fmt.Printf("rvland-agent: "+f+"\n", a...)
}
