package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestTimestampHermes_FormatoEMonotonico(t *testing.T) {
	e := &EstadoHermes{}
	agora := tempo(t, "2026-11-23T12:00:00.123456Z")
	t1 := proximoTimestamp(e, agora)
	if formatoTs(t1) != "2026-11-23T12:00:00.123Z" {
		t.Fatalf("formato inesperado: %s", formatoTs(t1))
	}
	e.UltimoTsMs = t1.UnixMilli()
	// mesmo instante: tem de ser ESTRITAMENTE maior
	t2 := proximoTimestamp(e, agora)
	if !t2.After(t1) || formatoTs(t2) != "2026-11-23T12:00:00.124Z" {
		t.Fatalf("deveria avançar 1 ms: %s", formatoTs(t2))
	}
	e.UltimoTsMs = t2.UnixMilli()
	// relógio voltou 1 h: continua crescente
	t3 := proximoTimestamp(e, agora.Add(-time.Hour))
	if !t3.After(t2) {
		t.Fatalf("relógio que volta não pode repetir/regredir: %s", formatoTs(t3))
	}
}

func TestEstadoHermes_PersisteESobreviveReinicio(t *testing.T) {
	p := filepath.Join(t.TempDir(), "hermes.json")
	e := &EstadoHermes{UltimoTsMs: 1234567, OffsetMs: -5000, RelogioSuspeito: true, UltimoEmitidoEm: "2026-11-20T12:00:00.000Z"}
	if err := salvaEstadoHermes(p, e); err != nil {
		t.Fatal(err)
	}
	if modo(t, p) != 0o600 {
		t.Fatalf("estado deveria ser 0600, é %v", modo(t, p))
	}
	l := carregaEstadoHermes(p)
	if l.UltimoTsMs != 1234567 || l.OffsetMs != -5000 || !l.RelogioSuspeito || l.UltimoEmitidoEm != e.UltimoEmitidoEm {
		t.Fatalf("estado não sobreviveu: %+v", l)
	}
	// arquivo corrompido = estado vazio (nunca derruba o agente)
	_ = os.WriteFile(p, []byte("{lixo"), 0o600)
	if l := carregaEstadoHermes(p); l.UltimoTsMs != 0 {
		t.Fatal("estado corrompido deveria virar vazio")
	}
}

func TestLimiteHermes_NoMaximoDoisEm60s(t *testing.T) {
	e := &EstadoHermes{}
	base := tempo(t, "2026-11-23T12:00:00Z")
	if esperaLimite(e, base) != 0 {
		t.Fatal("sem envios não espera")
	}
	registraEnvio(e, base)
	if esperaLimite(e, base.Add(time.Second)) != 0 {
		t.Fatal("o segundo envio em 60 s é permitido (retentativa do RELOGIO)")
	}
	registraEnvio(e, base.Add(time.Second))
	w := esperaLimite(e, base.Add(10*time.Second))
	if w != 50*time.Second {
		t.Fatalf("terceiro em 60 s deveria esperar 50 s, espera %v", w)
	}
	if esperaLimite(e, base.Add(60*time.Second)) != 0 {
		t.Fatal("após 60 s do mais antigo deveria liberar")
	}
	// relógio voltou 1 h depois de 2 envios: espera, mas nunca mais de 60 s (não trava o ciclo)
	e = &EstadoHermes{}
	registraEnvio(e, base)
	registraEnvio(e, base.Add(time.Second))
	if w := esperaLimite(e, base.Add(-time.Hour)); w <= 0 || w > 60*time.Second {
		t.Fatalf("espera com relógio que voltou fora de (0, 60s]: %v", w)
	}
}

func TestRelogioHermes_MedeDefasagemSemMexerNoRelogio(t *testing.T) {
	e := &EstadoHermes{}
	local := tempo(t, "2026-11-23T12:00:00Z")
	// servidor 10 min à frente: relógio local não confiável, offset aplicado
	medeRelogio(e, local.Add(10*time.Minute), local)
	if !e.RelogioSuspeito || e.OffsetMs != (10*time.Minute).Milliseconds() {
		t.Fatalf("deveria marcar suspeito com offset 10 min: %+v", e)
	}
	if got := agoraCorrigida(e, local); !got.Equal(local.Add(10 * time.Minute)) {
		t.Fatalf("agora corrigida errada: %v", got)
	}
	// relógio consertado (diferença pequena): volta a confiável e zera o offset
	medeRelogio(e, local.Add(3*time.Second), local)
	if e.RelogioSuspeito || e.OffsetMs != 0 {
		t.Fatalf("diferença pequena deveria voltar a confiável: %+v", e)
	}
}

func TestEventosHermes_FilaLimitada(t *testing.T) {
	e := &EstadoHermes{}
	for i := 0; i < 30; i++ {
		enfileiraEvento(e, EventoHermes{Tipo: "hermes_update_ok", Mensagem: "x"})
	}
	if len(e.Eventos) != 20 {
		t.Fatalf("fila deveria guardar no máximo 20, tem %d", len(e.Eventos))
	}
	// tipo fora da lista do servidor nunca entra
	enfileiraEvento(e, EventoHermes{Tipo: "hermes_clone_suspeito", Mensagem: "x"})
	enfileiraEvento(e, EventoHermes{Tipo: "heartbeat", Mensagem: "x"})
	for _, ev := range e.Eventos {
		if ev.Tipo != "hermes_update_ok" {
			t.Fatalf("tipo não permitido entrou na fila: %s", ev.Tipo)
		}
	}
}
