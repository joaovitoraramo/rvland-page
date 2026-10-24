package main

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

func TestAcaoNaSubida(t *testing.T) {
	if a := acaoNaSubida(nil, "0.6.0"); a != "nada" {
		t.Fatalf("sem marcador = %s", a)
	}
	m := &marcadorAtualizacao{VersaoNova: "0.6.0", VersaoAnterior: "0.5.0"}
	if a := acaoNaSubida(m, "0.5.0"); a != "limpar" {
		t.Fatalf("rodando a anterior = %s; quer limpar", a)
	}
	for i := 0; i < maxSubidasSemConfirmar; i++ {
		m.Subidas = i
		if a := acaoNaSubida(m, "0.6.0"); a != "aguardar" {
			t.Fatalf("subida %d = %s; quer aguardar", i+1, a)
		}
	}
	m.Subidas = maxSubidasSemConfirmar
	if a := acaoNaSubida(m, "0.6.0"); a != "voltar" {
		t.Fatalf("passou do limite = %s; quer voltar", a)
	}
}

func TestVersoesRecusadas(t *testing.T) {
	t.Setenv("RVLAND_STATE_DIR", t.TempDir())
	if len(versoesRecusadas()) != 0 {
		t.Fatal("começa vazio")
	}
	recusaVersao("0.6.0")
	recusaVersao("0.6.0")
	if l := versoesRecusadas(); len(l) != 1 || l[0] != "0.6.0" {
		t.Fatalf("recusadas = %v", l)
	}
	// recusa vencida (mais de 24 h) não vale mais
	m := carregaRecusas()
	m["0.5.9"] = time.Now().Add(-25 * time.Hour)
	b, _ := json.Marshal(m)
	_ = os.WriteFile(caminhoVersoesFalhas(), b, 0o644)
	if contem(versoesRecusadas(), "0.5.9") || !contem(versoesRecusadas(), "0.6.0") {
		t.Fatalf("recusadas = %v", versoesRecusadas())
	}
	// autoAtualiza nem baixa uma versão recusada
	if err := autoAtualiza("http://127.0.0.1:1", "0.6.0", "0.5.0"); err != nil {
		t.Fatalf("autoAtualiza com versão recusada = %v; quer nil sem rede", err)
	}
}
