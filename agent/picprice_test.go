package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func prod(id, cod, desc, valor, dist string) produtoFonte {
	return produtoFonte{ID: id, Desc: desc, Valor: json.Number(valor), Distkm: json.Number(dist), Tempo: "há 1 hora",
		Estabelecimento: &estabelecimentoFonte{Codigo: cod}}
}

var cod43 = strings.Repeat("A", 43)

func TestIsca(t *testing.T) {
	if !ehIsca(prod("abc.1", strings.Repeat("z", 88), "X", "1", "1")) {
		t.Fatal("deveria ser isca")
	}
	if ehIsca(prod("Ab_9-x", cod43, "X", "1", "1")) {
		t.Fatal("item real marcado como isca")
	}
	if ehIsca(prod("abc", cod43, "X", "1", "1")) {
		t.Fatal("id minúsculo mas código de 43: real")
	}
	if !soIsca(&respostaFonte{Produtos: []produtoFonte{prod("a.1", "zz", "", "1", "1")}}) {
		t.Fatal("resposta só de isca")
	}
}

func TestRankingTiraPropriaLojaEDuplicados(t *testing.T) {
	r := &respostaFonte{Total: "7", Produtos: []produtoFonte{
		prod("A1", cod43, "COCA", "9.99", "0.06"), // própria loja (mesmo preço, 60 m)
		prod("A2", strings.Repeat("B", 43), "COCA", "9.99", "2.5"),
		prod("A3", strings.Repeat("C", 43), "COCA", "10.99", "2.3"),
		prod("A3b", strings.Repeat("C", 43), "COCA", "10.99", "2.3"), // repetido
		prod("abc.9", strings.Repeat("z", 88), "LIXO", "1.00", "0.1"), // isca
		prod("A4", strings.Repeat("D", 43), "COCA", "8.49", "1.2"),
	}}
	precos, total, propria := montarRankingLoja(r, 9.99, false)
	if propria != 1 || total != 6 {
		t.Fatalf("propria=%d total=%d", propria, total)
	}
	if len(precos) != 3 || precos[0].Valor != 8.49 || precos[1].Valor != 9.99 || precos[1].DistanciaKm != 2.5 {
		t.Fatalf("ranking errado: %+v", precos)
	}
	for i, p := range precos {
		if p.Posicao != i+1 {
			t.Fatalf("posição não contínua: %+v", precos)
		}
	}
	// sem preço de venda: nada é tirado
	if _, _, pr := montarRankingLoja(r, 0, false); pr != 0 {
		t.Fatal("sem preço de venda não reconhece a própria loja")
	}
}

func TestRankingNomeEstabelecimentoCondicional(t *testing.T) {
	p := prod("A2", cod43, "COCA", "9.99", "2.5")
	p.Estabelecimento.NmFan = "SUPER XPTO"
	r := &respostaFonte{Total: "1", Produtos: []produtoFonte{p}}

	semNome, _, _ := montarRankingLoja(r, 0, false)
	if len(semNome) != 1 || semNome[0].Estabelecimento != "" {
		t.Fatalf("sem autorização não deveria trazer nome: %+v", semNome)
	}
	comNome, _, _ := montarRankingLoja(r, 0, true)
	if len(comNome) != 1 || comNome[0].Estabelecimento != "SUPER XPTO" {
		t.Fatalf("com autorização deveria trazer o nome: %+v", comNome)
	}
}

func TestNormalizaPedido(t *testing.T) {
	raio := 99.0
	p, a, err := normalizaPedido(pedidoRanking{Gtin: "007891010793463", Raio: &raio,
		Lojas: []lojaPedido{{Codigo: "002", Geohash: "6GKZMG4BX"}, {Codigo: "001", Geohash: "6gkzq99z5j5f"}}})
	if err != nil {
		t.Fatal(err)
	}
	if p.Gtin != "7891010793463" || *p.Raio != 20 || *p.Data != -1 {
		t.Fatalf("normalização: %+v", p)
	}
	if strings.Join(a.Lojas, ",") != "6gkzmg4bx,6gkzq99z5j5f" {
		t.Fatalf("lojas da autorização: %v", a.Lojas)
	}
	if _, _, err := normalizaPedido(pedidoRanking{Gtin: "123", Lojas: []lojaPedido{{Codigo: "1", Geohash: "6gkzq"}}}); err == nil {
		t.Fatal("gtin curto deveria falhar")
	}
	if _, _, err := normalizaPedido(pedidoRanking{Gtin: "7891010793463", Lojas: []lojaPedido{{Codigo: "1", Geohash: "x!"}}}); err == nil {
		t.Fatal("geohash inválido deveria falhar")
	}
}

// autorização assinada como a plataforma faria
func autorizacaoAssinada(t *testing.T, pa payloadAutorizacao) *LeaseEnvelope {
	seed, pub := geraChaveAgente()
	licensePK = pub
	b, _ := json.Marshal(pa)
	sig, err := assina(b, seed)
	if err != nil {
		t.Fatal(err)
	}
	return &LeaseEnvelope{Payload: base64.StdEncoding.EncodeToString(b), Assinatura: sig}
}

func TestConfereAutorizacao(t *testing.T) {
	agora := time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)
	a := &apiLocal{cfg: &Config{ServidorID: "srv-1"}, agora: func() time.Time { return agora }}
	ped := pedidoAutorizacao{Gtin: "7891010793463", Lojas: []string{"6gkzq99z5j5f"}, Raio: 3, Data: -1}
	base := payloadAutorizacao{V: 1, Tipo: "picprice_autorizacao", ServidorID: "srv-1", Gtin: ped.Gtin, Lojas: ped.Lojas,
		Raio: 3, Data: -1, ExpiraEm: agora.Add(time.Minute).Format(time.RFC3339)}

	if _, err := a.confereAutorizacao(autorizacaoAssinada(t, base), ped); err != nil {
		t.Fatalf("deveria aceitar: %v", err)
	}
	outro := base
	outro.ServidorID = "srv-2"
	if _, err := a.confereAutorizacao(autorizacaoAssinada(t, outro), ped); err == nil {
		t.Fatal("autorização de outro servidor aceita")
	}
	vencida := base
	vencida.ExpiraEm = agora.Add(-time.Second).Format(time.RFC3339)
	if _, err := a.confereAutorizacao(autorizacaoAssinada(t, vencida), ped); err == nil {
		t.Fatal("autorização vencida aceita")
	}
	outroEAN := base
	outroEAN.Gtin = "7890000000000"
	if _, err := a.confereAutorizacao(autorizacaoAssinada(t, outroEAN), ped); err == nil {
		t.Fatal("EAN diferente aceito")
	}
	env := autorizacaoAssinada(t, base)
	env.Payload = base64.StdEncoding.EncodeToString([]byte(`{"tipo":"picprice_autorizacao","servidor_id":"srv-1"}`))
	if _, err := a.confereAutorizacao(env, ped); err == nil {
		t.Fatal("payload adulterado aceito")
	}
}

// apiTeste monta a API com autorização e fonte falsas.
func apiTeste(t *testing.T, mods Modulos, estadoAuth string) (*apiLocal, *[]time.Duration, *int) {
	agora := time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)
	esperas := []time.Duration{}
	chamadasFonte := 0
	a := &apiLocal{
		cfg:     &Config{ServidorID: "srv-1"},
		cache:   map[string]itemCache{},
		agora:   func() time.Time { return agora },
		dormir:  func(_ context.Context, d time.Duration) error { esperas = append(esperas, d); return nil },
		modulos: func() Modulos { return mods },
	}
	a.autorizar = func(_ context.Context, token string, p pedidoAutorizacao) (respAutorizacao, error) {
		if estadoAuth != "OK" {
			return respAutorizacao{Estado: estadoAuth, bruto: map[string]any{"estado": estadoAuth, "mensagem": "x"}}, nil
		}
		env := autorizacaoAssinada(t, payloadAutorizacao{V: 1, Tipo: "picprice_autorizacao", ServidorID: "srv-1",
			Gtin: p.Gtin, Lojas: p.Lojas, Raio: p.Raio, Data: p.Data, ExpiraEm: agora.Add(time.Minute).Format(time.RFC3339)})
		return respAutorizacao{Estado: "OK", Autorizacao: env, Uso: map[string]any{"usado": 1, "limite": 200}}, nil
	}
	a.buscarFont = func(_ context.Context, _ string) (*respostaFonte, error) {
		chamadasFonte++
		return &respostaFonte{Total: "2", Produtos: []produtoFonte{
			prod("A1", cod43, "COCA", "9.99", "0.06"),
			prod("A2", strings.Repeat("B", 43), "COCA", "10.49", "1.5"),
		}}, nil
	}
	return a, &esperas, &chamadasFonte
}

func chamar(h http.Handler, metodo, caminho, corpo, remoto string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(metodo, caminho, strings.NewReader(corpo))
	req.RemoteAddr = remoto
	req.Header.Set("Authorization", "Bearer rvpp_x")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

const corpoRanking = `{"gtin":"7891010793463","lojas":[{"codigo":"001","geohash":"6gkzq99z5j5f","precoVenda":9.99}],"raio":3}`

func TestRankingFluxoCompleto(t *testing.T) {
	a, esperas, nFonte := apiTeste(t, Modulos{Picprice: true}, "OK")
	h := a.rotas()
	w := chamar(h, "POST", "/v1/picprice/ranking", corpoRanking, "127.0.0.1:5000")
	if w.Code != 200 {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	var r struct {
		Estado string
		Lojas  []struct {
			Loja               string
			TotalNaArea        int
			PropriaLojaNaFonte bool
			Precos             []precoRanking
		}
	}
	_ = json.Unmarshal(w.Body.Bytes(), &r)
	if r.Estado != "OK" || len(r.Lojas) != 1 || r.Lojas[0].TotalNaArea != 1 || !r.Lojas[0].PropriaLojaNaFonte || r.Lojas[0].Precos[0].Valor != 10.49 {
		t.Fatalf("resposta: %s", w.Body.String())
	}
	// segunda consulta logo em seguida: espera o intervalo mínimo e usa o cache local
	chamar(h, "POST", "/v1/picprice/ranking", corpoRanking, "127.0.0.1:5000")
	achou := false
	for _, e := range *esperas {
		if e == intervaloMinimoConsulta {
			achou = true
		}
	}
	if !achou {
		t.Fatalf("não respeitou o intervalo mínimo: %v", *esperas)
	}
	if *nFonte != 1 {
		t.Fatalf("cache local não usado: %d chamadas à fonte", *nFonte)
	}
}

func TestRankingModuloDesligadoEEstados(t *testing.T) {
	a, _, nFonte := apiTeste(t, Modulos{Licenca: true}, "OK")
	w := chamar(a.rotas(), "POST", "/v1/picprice/ranking", corpoRanking, "127.0.0.1:5000")
	if w.Code != 403 || !strings.Contains(w.Body.String(), "MODULO_DESATIVADO") {
		t.Fatalf("módulo desligado: %d %s", w.Code, w.Body.String())
	}
	a2, _, _ := apiTeste(t, Modulos{Picprice: true}, "LIMITE_DIARIO")
	w = chamar(a2.rotas(), "POST", "/v1/picprice/ranking", corpoRanking, "127.0.0.1:5000")
	if w.Code != 429 || !strings.Contains(w.Body.String(), "LIMITE_DIARIO") {
		t.Fatalf("limite: %d %s", w.Code, w.Body.String())
	}
	if *nFonte != 0 {
		t.Fatal("consultou a fonte sem autorização")
	}
}

func TestSoLocal(t *testing.T) {
	a, _, _ := apiTeste(t, Modulos{Picprice: true}, "OK")
	w := chamar(a.rotas(), "GET", "/v1/saude", "", "192.168.1.50:4000")
	if w.Code != 403 {
		t.Fatalf("chamada de fora deveria ser recusada: %d", w.Code)
	}
	w = chamar(a.rotas(), "GET", "/v1/saude", "", "127.0.0.1:4000")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"picprice":true`) {
		t.Fatalf("saúde: %d %s", w.Code, w.Body.String())
	}
}

func TestModulosDoLeaseCompat(t *testing.T) {
	if m := modulosDoLease(&Lease{}); !m.Licenca || m.Picprice {
		t.Fatal("lease antigo deveria ser só licença")
	}
	if m := modulosDoLease(&Lease{Modulos: &Modulos{Picprice: true}}); m.Licenca || !m.Picprice {
		t.Fatal("módulos do lease ignorados")
	}
}

func TestLicencaDesligadaNaoBloqueia(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("RVLAND_STATE_DIR", dir)
	gs := &gerenciadorDry{estado: map[string]bool{"app.service": true}}
	vencida := &Lease{Status: "bloqueado", OperarAte: "2000-01-01T00:00:00Z", ServicosLicenciados: []string{"app.service"},
		Modulos: &Modulos{Licenca: false, Picprice: true}}
	aplicaSeLicenca(vencida, gs, &EstadoAgente{})
	if ativo, _ := gs.Ativo("app.service"); !ativo {
		t.Fatal("com licença desligada o agente parou serviço")
	}
	vencida.Modulos.Licenca = true
	aplicaSeLicenca(vencida, gs, &EstadoAgente{})
	if ativo, _ := gs.Ativo("app.service"); ativo {
		t.Fatal("com licença ligada e vencida deveria bloquear")
	}
}
