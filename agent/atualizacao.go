package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// Controle da atualização automática no Windows, onde o .exe em uso não pode
// ser sobrescrito: o atual vira .old, o novo entra no lugar e um marcador fica
// em disco até a versão nova falar com a RV. Se ela não firmar, volta para a
// anterior e a versão que falhou é recusada localmente por 24 h (senão o painel
// mandaria atualizar de novo a cada heartbeat). As decisões são funções puras aqui,
// testáveis em qualquer SO; as operações de arquivo ficam em update_windows.go.

const (
	maxSubidasSemConfirmar = 3                // subidas da versão nova sem contato com a RV
	prazoConfirmacao       = 10 * time.Minute // tempo da versão nova falar com a RV
)

type marcadorAtualizacao struct {
	VersaoNova     string    `json:"versao_nova"`
	VersaoAnterior string    `json:"versao_anterior"`
	Exe            string    `json:"exe"`
	Subidas        int       `json:"subidas"`
	Em             time.Time `json:"em"`
}

// acaoNaSubida decide o que fazer ao iniciar com um marcador pendente.
//
//	"limpar": o marcador não é desta versão (já voltou, ou outra troca) — apaga.
//	"voltar": a versão nova já subiu demais sem confirmar — restaura a anterior.
//	"aguardar": conta a subida e espera a confirmação.
func acaoNaSubida(m *marcadorAtualizacao, versaoAtual string) string {
	if m == nil {
		return "nada"
	}
	if m.VersaoNova != versaoAtual {
		return "limpar"
	}
	if m.Subidas+1 > maxSubidasSemConfirmar {
		return "voltar"
	}
	return "aguardar"
}

func caminhoMarcador() string      { return filepath.Join(dirState(), "atualizacao.json") }
func caminhoVersoesFalhas() string { return filepath.Join(dirState(), "versoes-recusadas.json") }

func carregaMarcador() *marcadorAtualizacao {
	b, err := os.ReadFile(caminhoMarcador())
	if err != nil {
		return nil
	}
	var m marcadorAtualizacao
	if json.Unmarshal(b, &m) != nil {
		return nil
	}
	return &m
}

func salvaMarcador(m *marcadorAtualizacao) {
	_ = os.MkdirAll(dirState(), 0o755)
	if b, err := json.Marshal(m); err == nil {
		_ = os.WriteFile(caminhoMarcador(), b, 0o644)
	}
}

func removeMarcador() { _ = os.Remove(caminhoMarcador()) }

// Recusa local de uma versão que não firmou. Expira em 24 h: se a falha foi
// da rede (e não da versão), o agente tenta de novo no dia seguinte.
const validadeRecusa = 24 * time.Hour

func carregaRecusas() map[string]time.Time {
	b, err := os.ReadFile(caminhoVersoesFalhas())
	if err != nil {
		return map[string]time.Time{}
	}
	m := map[string]time.Time{}
	if json.Unmarshal(b, &m) != nil {
		return map[string]time.Time{}
	}
	return m
}

// versoesRecusadas: as recusas ainda válidas.
func versoesRecusadas() []string {
	agora := time.Now()
	out := []string{}
	for v, em := range carregaRecusas() {
		if agora.Sub(em) < validadeRecusa {
			out = append(out, v)
		}
	}
	return out
}

func recusaVersao(v string) {
	m := carregaRecusas()
	agora := time.Now()
	for k, em := range m { // limpa as vencidas
		if agora.Sub(em) >= validadeRecusa {
			delete(m, k)
		}
	}
	m[v] = agora
	_ = os.MkdirAll(dirState(), 0o755)
	if b, err := json.Marshal(m); err == nil {
		_ = os.WriteFile(caminhoVersoesFalhas(), b, 0o644)
	}
}
