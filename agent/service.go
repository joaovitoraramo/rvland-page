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
	Status(unidade string) (string, error) // saída de `systemctl status`
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
func (g *gerenciadorSystemd) Status(unidade string) (string, error) {
	// status sai com código != 0 se inativo; queremos a saída mesmo assim
	out, _ := exec.Command("systemctl", "status", unidade, "--no-pager", "-l", "-n", "12").CombinedOutput()
	return string(out), nil
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
func (g *gerenciadorDry) Status(unidade string) (string, error) {
	ativo, _ := g.Ativo(unidade)
	estado := "inactive (dead)"
	if ativo {
		estado = "active (running)"
	}
	return "● " + unidade + "\n     Active: " + estado + "\n     (driver dry — sem systemd real)", nil
}

func logf(f string, a ...any) {
	fmt.Printf("rvland-agent: "+f+"\n", a...)
}
