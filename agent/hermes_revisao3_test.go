package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

// Testes da 3ª revisão Opus: falsos positivos de desarme (FP1/FP2), lacunas N8/N12/N14,
// fingerprint cruzado com o Hermes e o campo container.chave_configurada.

// ── A) FP1: 200 com `agora` 1 h atrasado repetindo o último documento ──

func TestReRevisao3_FP1_AgoraAtrasadoNaoDesarma(t *testing.T) {
	m, a := novoMundo(t, true)
	d := docEmitido(t, m.agora, m.agora.Add(96*time.Hour))
	m.padrao = respostaFake{status: 200, corpo: corpo200(d, m.agora)}
	a.ciclo()
	if !m.existe(a, marcadorObrigatoria) {
		t.Fatal("pré-condição: armada")
	}
	m.agora = m.agora.Add(61 * time.Second)
	m.padrao = respostaFake{status: 200, corpo: corpo200(d, m.agora.Add(-time.Hour))} // `agora` não assinado, 1 h atrás
	a.ciclo()
	if !m.existe(a, marcadorObrigatoria) {
		t.Fatal("o container aceita o documento do disco: obrigatoria não pode ser removida")
	}
	if ev := eventosDoEstado(a); strings.Contains(ev, "hermes_relogio") || strings.Contains(ev, "removido") {
		t.Fatalf("evento falso: %s", ev)
	}
	confereContainer(t, a.arq, m.agora, "", vetorPubB64, "liberar")
}

// ── A) FP2: agente re-enrolado (servidor_id novo) com o documento antigo no disco ──

func TestReRevisao3_FP2_ReenroladoNaoDesarma(t *testing.T) {
	m, a := novoMundo(t, true)
	a.ciclo()
	if !m.existe(a, marcadorObrigatoria) {
		t.Fatal("pré-condição: armada")
	}
	a.cfg.ServidorID = "srv-reenrolado"
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo() // o RV ainda devolve o documento do servidor antigo
	if !m.existe(a, marcadorObrigatoria) {
		t.Fatal("re-enroll: o container ainda aceita o documento; obrigatoria fica")
	}
	if ev := eventosDoEstado(a); strings.Contains(ev, "removido") {
		t.Fatalf("evento falso: %s", ev)
	}
	confereContainer(t, a.arq, m.agora, "", vetorPubB64, "liberar")
}

// ── B) N8: filtro por uid na limpeza do /tmp ──

func TestReRevisao3_LimpezaSoDoProprioUID(t *testing.T) {
	dir := t.TempDir()
	velho := time.Now().Add(-2 * time.Hour)
	p := filepath.Join(dir, prefixoSaidaUpdate+"x.log")
	_ = os.WriteFile(p, []byte("x"), 0o600)
	_ = os.Chtimes(p, velho, velho)
	limpaSaidasAntigasDoUID(dir, time.Now(), os.Getuid()+1) // arquivo de OUTRO usuário
	if _, err := os.Stat(p); err != nil {
		t.Fatal("arquivo de outro uid não pode ser apagado")
	}
	limpaSaidasAntigasDoUID(dir, time.Now(), os.Getuid())
	if _, err := os.Stat(p); err == nil {
		t.Fatal("arquivo do próprio uid deveria ser apagado")
	}
}

// ── B) N12: 5xx depois de o servidor aceitar o timestamp ──

type servidor500 struct {
	servidorJanela
	falha map[int]bool
	n     int
}

func (s *servidor500) post(url string, corpo []byte, h map[string]string) (int, []byte, http.Header, error) {
	st, b, hd, err := s.servidorJanela.post(url, corpo, h)
	s.n++
	if s.falha[s.n] {
		return 500, []byte(`erro interno`), http.Header{}, nil
	}
	return st, b, hd, err
}

func TestReRevisao3_PisoCom5xxDepoisRelogio(t *testing.T) {
	m, a := novoMundo(t, true)
	srv := m.agora.Add(-4 * time.Minute)
	s := &servidor500{servidorJanela: servidorJanela{m: m, agora: func() time.Time { return srv }}, falha: map[int]bool{1: true}}
	a.post = s.post
	a.ciclo() // o RV aceitou e respondeu 500
	srv = srv.Add(61 * time.Second)
	m.agora = m.agora.Add(time.Hour + 61*time.Second)
	a.ciclo()
	if len(s.status) != 3 || s.status[1] != 409 || s.status[2] != 200 {
		t.Fatalf("5xx conta como possivelmente aceito (sem REPLAY após RELOGIO): %v", s.status)
	}
}

// ── B) N14: licenca.json ausente + marcador presente + RV fora => desarma ──

func TestReRevisao3_DocAusenteComMarcadorRVFora(t *testing.T) {
	m, a := novoMundo(t, true)
	a.ciclo()
	_ = os.Remove(filepath.Join(a.arq.dirLicenca, nomeDocHermes))
	m.padrao = respostaFake{err: errors.New("rede")}
	m.agora = m.agora.Add(61 * time.Second)
	a.ciclo()
	if m.existe(a, marcadorObrigatoria) {
		t.Fatal("sem licenca.json o container recusaria: obrigatoria deve sair")
	}
	confereContainer(t, a.arq, m.agora, "", vetorPubB64, "liberar")
}

// ── C) fingerprint cruzado com o Hermes (src/lib/fixtures/vetor-rvland.json, chave de TESTE) ──

func TestReRevisao3_FingerprintDoVetorDoHermes(t *testing.T) {
	const fpVetorHermes = "597fda199b0d7ba7b9298d97e840383ad61e999c67e6a2cd83f6c3113b8e9dd0"
	if got := fpChaveHermes(vetorPubB64); got != fpVetorHermes {
		t.Fatalf("fp da chave do vetor: %s, o Hermes espera %s", got, fpVetorHermes)
	}
}

// ── D) container.chave_configurada no corpo do sync ──

func chaveConfiguradaNoCorpo(t *testing.T, info InfoContainer) (any, bool) {
	t.Helper()
	var c map[string]any
	if err := json.Unmarshal(montaCorpoSync(&EstadoHermes{}, info, fingerprintHermes{MachineIDHash: strings.Repeat("ab", 32)}), &c); err != nil {
		t.Fatal(err)
	}
	v, ok := c["container"].(map[string]any)["chave_configurada"]
	return v, ok
}

func TestReRevisao3_ChaveConfiguradaNoSync(t *testing.T) {
	hermesPK = vetorPubB64
	defer func() { hermesPK = "" }()
	fp := fpChaveHermes(vetorPubB64)
	_, outra := geraChaveAgente()
	casos := []struct {
		nome     string
		info     InfoContainer
		valor    any
		presente bool
	}{
		{"real + fp igual", InfoContainer{Estado: "rodando", LabelConhecido: true, LicencaChave: "real", LicencaChaveFP: fp}, true, true},
		{"real sem fp", InfoContainer{Estado: "rodando", LabelConhecido: true, LicencaChave: "real"}, false, true},
		{"real com fp de outra chave", InfoContainer{Estado: "rodando", LabelConhecido: true, LicencaChave: "real", LicencaChaveFP: fpChaveHermes(outra)}, false, true},
		{"placeholder com fp igual", InfoContainer{Estado: "parado", LabelConhecido: true, LicencaChave: "placeholder", LicencaChaveFP: fp}, false, true},
		{"container ausente", InfoContainer{Estado: "ausente"}, false, true},
		{"docker desconhecido", InfoContainer{Estado: "desconhecido"}, nil, false},
	}
	for _, c := range casos {
		v, ok := chaveConfiguradaNoCorpo(t, c.info)
		if ok != c.presente || (ok && v != c.valor) {
			t.Errorf("%s: chave_configurada=%v (presente=%v), esperado %v (presente=%v)", c.nome, v, ok, c.valor, c.presente)
		}
	}
	// agente sem chave embutida: nunca afirma true
	hermesPK = ""
	if v, _ := chaveConfiguradaNoCorpo(t, casos[0].info); v != false {
		t.Fatalf("sem hermesPK a cadeia não fecha: %v", v)
	}
	if v, _ := chaveConfiguradaNoCorpo(t, InfoContainer{Estado: "rodando", LabelConhecido: true, LicencaChave: "real"}); v != false {
		t.Fatalf("sem hermesPK e sem label fp (\"\" == \"\") não pode virar true: %v", v)
	}
}

// o corpo completo continua no esquema (chaves exatas do container)
func TestReRevisao3_ContainerComChaveConfiguradaNoEsquema(t *testing.T) {
	m, a := novoMundo(t, true)
	a.ciclo()
	var c map[string]any
	_ = json.Unmarshal(m.pedidos[0].corpo, &c)
	var k []string
	for x := range c["container"].(map[string]any) {
		k = append(k, x)
	}
	sort.Strings(k)
	if got := strings.Join(k, ","); got != "chave_configurada,digest,estado,saude,versao" {
		t.Fatalf("chaves de container: %s", got)
	}
}
