package main

import (
	"context"
	"encoding/json"
	"testing"
)

// iscaFonte devolve sempre resposta-isca (itens falsos) e conta as batidas.
func iscaFonte(n *int) func(context.Context, string) (*respostaFonte, error) {
	return func(_ context.Context, _ string) (*respostaFonte, error) {
		*n++
		return &respostaFonte{Total: "1", Produtos: []produtoFonte{prod("a.1", "zz", "X", "9.99", "0.1")}}, nil
	}
}

// Enxurrada do chamador: depois de esvaziar o balde, o agente segura com
// MUITAS_REQUISICOES (429) sem bater na fonte.
func TestGuardaBaneEnxurrada(t *testing.T) {
	a, _, nFonte := apiTeste(t, Modulos{Picprice: true}, "OK")
	h := a.rotas()

	// forcar=true: cada consulta bate mesmo na fonte (sem servir do cache), para
	// drenar o balde como faria uma enxurrada de itens diferentes.
	corpoForca := `{"gtin":"7891010793463","lojas":[{"codigo":"001","geohash":"6gkzq99z5j5f","precoVenda":9.99}],"raio":3,"forcar":true}`
	oks := 0
	for i := 0; i < int(baldeCapacidade)+5; i++ {
		w := chamar(h, "POST", "/v1/picprice/ranking", corpoForca, "127.0.0.1:5000")
		if w.Code == 200 {
			oks++
			continue
		}
		if w.Code != 429 {
			t.Fatalf("req %d: esperava 200 ou 429, veio %d: %s", i, w.Code, w.Body.String())
		}
		var r struct{ Estado string }
		_ = json.Unmarshal(w.Body.Bytes(), &r)
		if r.Estado != "MUITAS_REQUISICOES" {
			t.Fatalf("req %d: estado %q", i, r.Estado)
		}
	}
	if oks < 1 || oks > int(baldeCapacidade) {
		t.Fatalf("passaram %d consultas antes do ban (esperado 1..%d)", oks, int(baldeCapacidade))
	}
	// o agente parou de bater na fonte depois do ban (não ficou enfileirando)
	if *nFonte != oks {
		t.Fatalf("bateu na fonte %d vezes mas só %d consultas passaram", *nFonte, oks)
	}
}

// Bloqueio da fonte (resposta-isca): 1ª consulta devolve FONTE_BLOQUEADA e abre
// o cooldown; a 2ª devolve FONTE_EM_COOLDOWN SEM bater na fonte de novo.
func TestGuardaFonteBloqueadaAbreCooldown(t *testing.T) {
	a, _, nFonte := apiTeste(t, Modulos{Picprice: true}, "OK")
	a.buscarFont = iscaFonte(nFonte) // fonte que só devolve iscas (bloqueio)
	h := a.rotas()

	w1 := chamar(h, "POST", "/v1/picprice/ranking", corpoRanking, "127.0.0.1:5000")
	if w1.Code != 503 {
		t.Fatalf("1ª: status %d: %s", w1.Code, w1.Body.String())
	}
	if est := estadoDe(w1.Body.Bytes()); est != "FONTE_BLOQUEADA" {
		t.Fatalf("1ª: estado %q", est)
	}
	batidas := *nFonte
	if batidas == 0 {
		t.Fatal("1ª: não bateu na fonte")
	}

	w2 := chamar(h, "POST", "/v1/picprice/ranking", corpoRanking, "127.0.0.1:5000")
	if w2.Code != 503 {
		t.Fatalf("2ª: status %d: %s", w2.Code, w2.Body.String())
	}
	if est := estadoDe(w2.Body.Bytes()); est != "FONTE_EM_COOLDOWN" {
		t.Fatalf("2ª: estado %q (esperava FONTE_EM_COOLDOWN)", est)
	}
	if *nFonte != batidas {
		t.Fatalf("2ª bateu na fonte durante o cooldown (%d -> %d)", batidas, *nFonte)
	}
}

func estadoDe(b []byte) string {
	var r struct{ Estado string }
	_ = json.Unmarshal(b, &r)
	return r.Estado
}
