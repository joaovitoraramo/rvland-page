package main

// Autoproteção do agente. O agente conhece os limites da fonte; esta guarda faz
// ele se defender de quem o chama (SyncRvLand/SyncCompras) e da própria fonte.
//
// Dois mecanismos independentes, ambos ANTES de bater na fonte:
//
//  1. Balde de fichas (token bucket): protege o AGENTE da enxurrada do chamador.
//     Cada consulta real à fonte gasta 1 ficha; o balde repõe devagar. Esvaziou
//     = o chamador está mandando rápido demais → ban temporário
//     (MUITAS_REQUISICOES), sem bater na fonte nem gastar cota. Insistir durante
//     o ban aumenta o tempo (escada). É o agente segurando o chamador.
//
//  2. Breaker da fonte: quando a FONTE devolve bloqueio (resposta-isca), o agente
//     para de consultá-la por um tempo longo e crescente (FONTE_EM_COOLDOWN),
//     protegendo o IP do cliente de escalar o bloqueio.
//
// Os dois devolvem `estado` + `cooldownSegundos` + `liberaEm` para o chamador
// respeitar o tempo. O estado vive em disco (sobrevive a restart/update).

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const (
	baldeCapacidade = 30.0             // fichas em rajada antes de segurar (< ~44 em que a fonte bloqueia)
	baldeRecargaSeg = 20.0             // 1 ficha a cada 20s (~3/min sustentado, folgado)
	banBase         = 30 * time.Second // ban do chamador ao esvaziar o balde
	banMax          = 15 * time.Minute
	cooldownBase    = 5 * time.Minute // cooldown da fonte ao detectar bloqueio-isca
	cooldownMax     = 60 * time.Minute
	nivelMax        = 6
)

func caminhoEstadoPicprice() string { return filepath.Join(dirState(), "picprice-estado.json") }

// estadoFonte é o que persiste em /var/lib/rvland/picprice-estado.json.
type estadoFonte struct {
	Cache          map[string]itemCachePersist `json:"cache,omitempty"`
	Fichas         float64                     `json:"fichas"`
	FichasEm       time.Time                   `json:"fichas_em"`
	BanAteh        time.Time                   `json:"ban_ateh"`
	BanNivel       int                         `json:"ban_nivel"`
	BreakerAteh    time.Time                   `json:"breaker_ateh"`
	BreakerNivel   int                         `json:"breaker_nivel"`
	Acertos        int                         `json:"acertos"`
	UltimoBloqueio time.Time                   `json:"ultimo_bloqueio"`
	UltimoBurst    int                         `json:"ultimo_burst"`
	MaiorBurst     int                         `json:"maior_burst"`
}

type itemCachePersist struct {
	Dados     *respostaFonte `json:"dados"`
	Expira    time.Time      `json:"expira"`
	BuscadoEm time.Time      `json:"buscado_em"`
}

// permissaoConsulta decide, ANTES de qualquer contato com a fonte, se a consulta
// pode seguir. Chamada com a.consulta travada. ok=false => o corpo/status já
// devem ser respondidos ao chamador.
func (a *apiLocal) permissaoConsulta() (ok bool, corpo map[string]any, status int) {
	a.estadoMu.Lock()
	defer a.estadoMu.Unlock()
	agora := a.agora()

	// 1. breaker da fonte (bloqueio real detectado antes)
	if agora.Before(a.breakerAteh) {
		resta := a.breakerAteh.Sub(agora)
		return false, map[string]any{
			"estado":           "FONTE_EM_COOLDOWN",
			"mensagem":         "A fonte bloqueou consultas recentes. Aguarde " + duracaoHumana(resta) + " antes de tentar de novo.",
			"cooldownSegundos": int(resta.Seconds()) + 1,
			"liberaEm":         a.breakerAteh.UTC().Format(time.RFC3339),
		}, http.StatusServiceUnavailable
	}

	// 2. ban do chamador (flood). Insistir durante o ban escala o tempo.
	if agora.Before(a.banAteh) {
		a.escalarBan(agora)
		return false, corpoMuitas(a.banAteh.Sub(agora), a.banAteh), http.StatusTooManyRequests
	}

	// 3. balde: sem ficha = o chamador está rápido demais → ban.
	a.reporFichas(agora)
	if a.fichas < 1 {
		a.escalarBan(agora)
		return false, corpoMuitas(a.banAteh.Sub(agora), a.banAteh), http.StatusTooManyRequests
	}
	return true, nil, 0
}

func corpoMuitas(resta time.Duration, ate time.Time) map[string]any {
	return map[string]any{
		"estado":           "MUITAS_REQUISICOES",
		"mensagem":         "Muitas consultas em pouco tempo. O RV Pic Price está segurando novas consultas por " + duracaoHumana(resta) + " para não ser bloqueado na fonte.",
		"cooldownSegundos": int(resta.Seconds()) + 1,
		"liberaEm":         ate.UTC().Format(time.RFC3339),
	}
}

// reporFichas repõe o balde conforme o tempo passado. Chamar com estadoMu travada.
func (a *apiLocal) reporFichas(agora time.Time) {
	if a.fichasEm.IsZero() {
		a.fichas, a.fichasEm = baldeCapacidade, agora
		return
	}
	dt := agora.Sub(a.fichasEm).Seconds()
	if dt <= 0 {
		return
	}
	a.fichas = math.Min(baldeCapacidade, a.fichas+dt/baldeRecargaSeg)
	a.fichasEm = agora
}

// escalarBan aumenta o ban do chamador (escada). Chamar com estadoMu travada.
func (a *apiLocal) escalarBan(agora time.Time) {
	a.banNivel++
	if a.banNivel > nivelMax {
		a.banNivel = nivelMax
	}
	d := banBase << (a.banNivel - 1)
	if d > banMax || d <= 0 {
		d = banMax
	}
	a.banAteh = agora.Add(d)
}

// debitarFicha gasta 1 ficha por consulta REAL à fonte (não conta acerto de cache).
func (a *apiLocal) debitarFicha() {
	a.estadoMu.Lock()
	a.fichas--
	a.estadoMu.Unlock()
}

// registrarAcerto: consulta OK. Zera a escada do breaker e do ban e conta o burst.
func (a *apiLocal) registrarAcerto(n int) {
	a.estadoMu.Lock()
	a.acertos += n
	if a.acertos > a.maiorBurst {
		a.maiorBurst = a.acertos
	}
	a.breakerNivel, a.breakerAteh = 0, time.Time{}
	a.banNivel = 0
	a.estadoMu.Unlock()
}

// registrarBloqueioFonte: a fonte devolveu isca. Abre/escala o cooldown e guarda
// a telemetria do limiar (quantas passaram antes do bloqueio). Devolve o cooldown.
func (a *apiLocal) registrarBloqueioFonte() time.Duration {
	a.estadoMu.Lock()
	defer a.estadoMu.Unlock()
	agora := a.agora()
	a.ultimoBloqueio = agora
	a.ultimoBurst = a.acertos
	if a.acertos > a.maiorBurst {
		a.maiorBurst = a.acertos
	}
	a.acertos = 0
	a.breakerNivel++
	if a.breakerNivel > nivelMax {
		a.breakerNivel = nivelMax
	}
	d := cooldownBase << (a.breakerNivel - 1)
	if d > cooldownMax || d <= 0 {
		d = cooldownMax
	}
	a.breakerAteh = agora.Add(d)
	return d
}

// snapshotFonte: telemetria para GET /v1/saude (limiar aprendido, cooldown, ban).
func (a *apiLocal) snapshotFonte() map[string]any {
	a.estadoMu.Lock()
	defer a.estadoMu.Unlock()
	agora := a.agora()
	a.reporFichas(agora)
	m := map[string]any{
		"fichas":      math.Round(a.fichas*10) / 10,
		"capacidade":  baldeCapacidade,
		"maiorBurst":  a.maiorBurst,
		"ultimoBurst": a.ultimoBurst,
	}
	if agora.Before(a.breakerAteh) {
		m["fonteCooldownSegundos"] = int(a.breakerAteh.Sub(agora).Seconds()) + 1
		m["fonteLiberaEm"] = a.breakerAteh.UTC().Format(time.RFC3339)
	}
	if agora.Before(a.banAteh) {
		m["chamadorBanSegundos"] = int(a.banAteh.Sub(agora).Seconds()) + 1
		m["chamadorLiberaEm"] = a.banAteh.UTC().Format(time.RFC3339)
	}
	if !a.ultimoBloqueio.IsZero() {
		m["ultimoBloqueio"] = a.ultimoBloqueio.UTC().Format(time.RFC3339)
	}
	return m
}

func (a *apiLocal) carregarEstado() {
	b, err := os.ReadFile(caminhoEstadoPicprice())
	if err != nil {
		return
	}
	var e estadoFonte
	if json.Unmarshal(b, &e) != nil {
		return
	}
	a.estadoMu.Lock()
	a.fichas, a.fichasEm = e.Fichas, e.FichasEm
	a.banAteh, a.banNivel = e.BanAteh, e.BanNivel
	a.breakerAteh, a.breakerNivel = e.BreakerAteh, e.BreakerNivel
	a.acertos, a.ultimoBloqueio = e.Acertos, e.UltimoBloqueio
	a.ultimoBurst, a.maiorBurst = e.UltimoBurst, e.MaiorBurst
	if a.fichasEm.IsZero() {
		a.fichas, a.fichasEm = baldeCapacidade, a.agora()
	}
	a.estadoMu.Unlock()
	agora := a.agora()
	a.cacheMu.Lock()
	for k, v := range e.Cache {
		if v.Dados != nil && agora.Before(v.Expira) {
			a.cache[k] = itemCache{dados: v.Dados, expira: v.Expira, buscadoEm: v.BuscadoEm}
		}
	}
	a.cacheMu.Unlock()
}

// salvarEstado grava cache + guarda em disco. `forcar` ignora o debounce de 2s
// (usado quando o breaker da fonte muda, que é o que mais importa persistir).
func (a *apiLocal) salvarEstado(forcar bool) {
	a.estadoMu.Lock()
	if !forcar && !a.ultimaGravacao.IsZero() && a.agora().Sub(a.ultimaGravacao) < 2*time.Second {
		a.estadoMu.Unlock()
		return
	}
	a.ultimaGravacao = a.agora()
	e := estadoFonte{
		Fichas: a.fichas, FichasEm: a.fichasEm,
		BanAteh: a.banAteh, BanNivel: a.banNivel,
		BreakerAteh: a.breakerAteh, BreakerNivel: a.breakerNivel,
		Acertos: a.acertos, UltimoBloqueio: a.ultimoBloqueio,
		UltimoBurst: a.ultimoBurst, MaiorBurst: a.maiorBurst,
		Cache: map[string]itemCachePersist{},
	}
	a.estadoMu.Unlock()

	a.cacheMu.Lock()
	for k, v := range a.cache {
		e.Cache[k] = itemCachePersist{Dados: v.dados, Expira: v.expira, BuscadoEm: v.buscadoEm}
	}
	a.cacheMu.Unlock()

	b, err := json.Marshal(e)
	if err != nil {
		return
	}
	tmp := caminhoEstadoPicprice() + ".tmp"
	if os.WriteFile(tmp, b, 0o644) == nil {
		_ = os.Rename(tmp, caminhoEstadoPicprice())
	}
}

func duracaoHumana(d time.Duration) string {
	if d < time.Minute {
		s := int(d.Seconds())
		if s < 1 {
			s = 1
		}
		return fmt.Sprintf("%ds", s)
	}
	if d < time.Hour {
		return fmt.Sprintf("%d min", int(d.Minutes()))
	}
	return fmt.Sprintf("%dh%02dmin", int(d.Hours()), int(d.Minutes())%60)
}
