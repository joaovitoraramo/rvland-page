package main

import (
	"sync"
	"time"
)

// Estado em memória do processo `run`, lido pela API local do picprice.
type runtimeAgente struct {
	mu            sync.RWMutex
	modulos       Modulos
	ultimoContato time.Time
}

var rt = &runtimeAgente{modulos: Modulos{Licenca: true}}

func (r *runtimeAgente) definirModulos(m Modulos) {
	r.mu.Lock()
	r.modulos = m
	r.mu.Unlock()
}

func (r *runtimeAgente) obterModulos() Modulos {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.modulos
}

func (r *runtimeAgente) registrarContato() {
	r.mu.Lock()
	r.ultimoContato = time.Now()
	r.mu.Unlock()
}

func (r *runtimeAgente) obterUltimoContato() time.Time {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.ultimoContato
}

// aplicaSeLicenca aplica o lease SÓ se o módulo licença estiver ligado nele.
// Desligado: o agente nunca para nem religa serviço por causa de licença. A única
// exceção é devolver ao ar o que ele MESMO tinha bloqueado antes do módulo ser
// desligado — senão o serviço ficaria parado para sempre.
func aplicaSeLicenca(l *Lease, gs GerenciadorServico, est *EstadoAgente) {
	mods := modulosDoLease(l)
	rt.definirModulos(mods)
	if mods.Licenca {
		aplicaLease(l, gs, est)
		return
	}
	for _, u := range append([]string{}, est.Bloqueados...) {
		if e := gs.Liberar(u); e != nil {
			logf("módulo licença desligado: falha ao devolver %s: %v", u, e)
			continue
		}
		est.Bloqueados = remove(est.Bloqueados, u)
		logf("módulo licença desligado: %s, que o agente tinha bloqueado, voltou ao ar", u)
	}
	est.Lease = l
	salvaEstado(est)
}
