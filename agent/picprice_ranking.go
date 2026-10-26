package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Formato da resposta da fonte (só os campos usados).
type produtoFonte struct {
	ID              string                `json:"id"`
	Desc            string                `json:"desc"`
	Valor           json.Number           `json:"valor"`
	Distkm          json.Number           `json:"distkm"`
	Tempo           string                `json:"tempo"`
	Datahora        *string               `json:"datahora"`
	Estabelecimento *estabelecimentoFonte `json:"estabelecimento"`
}

// estabelecimentoFonte: o código (hash de 43 chars) sempre vem; o nome pode vir
// em campos variados conforme a fonte — pegamos o primeiro não-vazio.
type estabelecimentoFonte struct {
	Codigo     string `json:"codigo"`
	NmFan      string `json:"nm_fan"`
	NmFantasia string `json:"nm_fantasia"`
	NmEmp      string `json:"nm_emp"`
	Nome       string `json:"nome"`
	Razao      string `json:"razao"`
}

func (e *estabelecimentoFonte) nome() string {
	if e == nil {
		return ""
	}
	for _, s := range []string{e.NmFan, e.NmFantasia, e.NmEmp, e.Nome, e.Razao} {
		if t := strings.TrimSpace(s); t != "" {
			return t
		}
	}
	return ""
}

type respostaFonte struct {
	Total    json.Number    `json:"total"`
	Produtos []produtoFonte `json:"produtos"`
}

var reIdIsca = regexp.MustCompile(`^[a-z0-9.]+$`)

// ehIsca: item falso anti-robô = id só com [a-z0-9.] E código de estabelecimento ≠ 43 chars.
func ehIsca(p produtoFonte) bool {
	codigo := ""
	if p.Estabelecimento != nil {
		codigo = p.Estabelecimento.Codigo
	}
	return reIdIsca.MatchString(p.ID) && len(codigo) != 43
}

// soIsca: veio produto, mas todos falsos (resposta-isca inteira).
func soIsca(r *respostaFonte) bool {
	if r == nil || len(r.Produtos) == 0 {
		return false
	}
	for _, p := range r.Produtos {
		if !ehIsca(p) {
			return false
		}
	}
	return true
}

func num(n json.Number) float64 {
	f, _ := strconv.ParseFloat(strings.TrimSpace(n.String()), 64)
	return f
}

type precoRanking struct {
	Posicao     int     `json:"posicao"`
	Valor       float64 `json:"valor"`
	DistanciaKm float64 `json:"distanciaKm"`
	Ha          string  `json:"ha"`
	DataHora    *string `json:"dataHora"`
	Descricao   string  `json:"descricao"`
	// nome do estabelecimento — só preenchido quando o lease da RV autoriza
	Estabelecimento string `json:"estabelecimento,omitempty"`
}

// ordenarSemRepetidos: tira isca, junta repetidos (loja+descrição+preço), ordena por preço e distância.
func ordenarSemRepetidos(r *respostaFonte) []produtoFonte {
	vistos := map[string]bool{}
	lista := []produtoFonte{}
	for _, p := range r.Produtos {
		if ehIsca(p) {
			continue
		}
		cod := ""
		if p.Estabelecimento != nil {
			cod = p.Estabelecimento.Codigo
		}
		chave := cod + "|" + p.Desc + "|" + p.Valor.String()
		if vistos[chave] {
			continue
		}
		vistos[chave] = true
		lista = append(lista, p)
	}
	sort.SliceStable(lista, func(i, j int) bool {
		vi, vj := num(lista[i].Valor), num(lista[j].Valor)
		if vi != vj {
			return vi < vj
		}
		return num(lista[i].Distkm) < num(lista[j].Distkm)
	})
	return lista
}

// montarRankingLoja: tira a PRÓPRIA loja (preço igual ao de venda dela a até
// 0,2 km do geohash — as vendas dela também estão na fonte) e devolve os 10
// menores concorrentes, numerados de 1 a 10.
func montarRankingLoja(r *respostaFonte, precoVenda float64, verEstabelecimento bool) (precos []precoRanking, totalNaArea int, propria int) {
	for _, p := range ordenarSemRepetidos(r) {
		v, d := num(p.Valor), num(p.Distkm)
		if precoVenda > 0 && d <= raioPropriaLojaKm && math.Abs(v-precoVenda) < 0.005 {
			propria++
			continue
		}
		if len(precos) < tamanhoRanking {
			pr := precoRanking{
				Posicao:     len(precos) + 1,
				Valor:       v,
				DistanciaKm: math.Round(d*100) / 100,
				Ha:          p.Tempo,
				DataHora:    p.Datahora,
				Descricao:   strings.TrimSpace(p.Desc),
			}
			if verEstabelecimento {
				pr.Estabelecimento = p.Estabelecimento.nome()
			}
			precos = append(precos, pr)
		}
	}
	totalNaArea = max(0, int(num(r.Total))-propria)
	return precos, totalNaArea, propria
}

func urlProdutos(geohash, gtin string, raio float64, data, size int) string {
	return fmt.Sprintf("%s/produtos?local=%s&offset=0&raio=%s&gtin=%s&data=%d&ordem=0&size=%d",
		fonteBase, geohash, strconv.FormatFloat(raio, 'f', -1, 64), url.QueryEscape(gtin), data, size)
}

// rankingDaLoja: size 20; se faltou para 10 e a área tem mais, pede 50. Cache local curto.
func (a *apiLocal) rankingDaLoja(ctx context.Context, gtin string, l lojaPedido, raio float64, data int, verEstabelecimento bool) (map[string]any, error) {
	r, err := a.buscarComCache(ctx, urlProdutos(l.Geohash, gtin, raio, data, 20))
	if err != nil {
		return nil, err
	}
	precos, total, propria := montarRankingLoja(r, l.PrecoVenda, verEstabelecimento)
	if len(precos) < tamanhoRanking && total > len(precos) {
		if r2, err := a.buscarComCache(ctx, urlProdutos(l.Geohash, gtin, raio, data, 50)); err == nil {
			precos, total, propria = montarRankingLoja(r2, l.PrecoVenda, verEstabelecimento)
		}
	}
	if precos == nil {
		precos = []precoRanking{}
	}
	return map[string]any{
		"loja":               l.Codigo,
		"geohash":            l.Geohash,
		"totalNaArea":        total,
		"precos":             precos,
		"propriaLojaNaFonte": propria > 0,
	}, nil
}

func (a *apiLocal) buscarComCache(ctx context.Context, u string) (*respostaFonte, error) {
	a.cacheMu.Lock()
	c, ok := a.cache[u]
	a.cacheMu.Unlock()
	if ok && a.agora().Before(c.expira) {
		return c.dados, nil
	}
	// resposta só de itens falsos: uma tentativa a mais e nunca entra no cache
	for tentativa := 0; tentativa < 2; tentativa++ {
		r, err := a.buscarFont(ctx, u)
		if err != nil {
			return nil, err
		}
		if !soIsca(r) {
			a.cacheMu.Lock()
			a.cache[u] = itemCache{dados: r, expira: a.agora().Add(validadeCacheFonte)}
			for k, v := range a.cache { // faxina
				if a.agora().After(v.expira) {
					delete(a.cache, k)
				}
			}
			a.cacheMu.Unlock()
			return r, nil
		}
		if err := a.dormir(ctx, time.Second); err != nil {
			return nil, err
		}
	}
	return nil, errors.New("a fonte devolveu só resultados falsos")
}

type erroFonte struct {
	msg          string
	vale_repetir bool
}

func (e *erroFonte) Error() string { return e.msg }

// buscarFonteReal: GET com tempo limite e até 2 novas tentativas em falha passageira.
func buscarFonteReal(ctx context.Context, u string) (*respostaFonte, error) {
	pausas := []time.Duration{time.Second, 2500 * time.Millisecond}
	var ultimo error
	for n := 0; n <= len(pausas); n++ {
		r, err := buscarUmaVez(ctx, u)
		if err == nil {
			return r, nil
		}
		ultimo = err
		var ef *erroFonte
		if !errors.As(err, &ef) || !ef.vale_repetir || n == len(pausas) {
			break
		}
		if dormirCtx(ctx, pausas[n]) != nil {
			break
		}
	}
	return nil, ultimo
}

func buscarUmaVez(ctx context.Context, u string) (*respostaFonte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("User-Agent", "rvland-agent/"+versao)
	resp, err := httpFonte.Do(req)
	if err != nil {
		return nil, &erroFonte{msg: "sem resposta da fonte", vale_repetir: ctx.Err() == nil}
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode != 200 {
		return nil, &erroFonte{msg: fmt.Sprintf("fonte respondeu HTTP %d", resp.StatusCode), vale_repetir: resp.StatusCode == 429 || resp.StatusCode >= 500}
	}
	var r respostaFonte
	dec := json.NewDecoder(strings.NewReader(string(b)))
	dec.UseNumber()
	if err := dec.Decode(&r); err != nil {
		return nil, &erroFonte{msg: "resposta da fonte ilegível"}
	}
	return &r, nil
}
