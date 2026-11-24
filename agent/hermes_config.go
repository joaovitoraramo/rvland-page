package main

import "path/filepath"

// ConfigHermes: bloco `hermes` do /etc/rvland/agent.conf (gravado pelo instalador ou por
// `agenterv enroll --modo=hermes` / `agenterv hermes configurar`). Vazios = padrões abaixo.
type ConfigHermes struct {
	InstalacaoID string `json:"instalacao_id,omitempty"` // confere o instalacao_id do documento
	Canal        string `json:"canal,omitempty"`         // canal inicial (até o 1º sync)
	DirHermes    string `json:"dir_hermes,omitempty"`    // /var/lib/hermes (rv/canal, estado.json)
	DirLicenca   string `json:"dir_licenca,omitempty"`   // <dir_hermes>/licenca (volume do container)
	HermesImagem string `json:"hermes_imagem,omitempty"` // /usr/local/bin/hermes-imagem
	Container    string `json:"container,omitempty"`     // hermes
	ArqModelo    string `json:"arquivo_modelo,omitempty"`
}

const modoHermes = "hermes"

// planoExecucao decide o que o `run` sobe. Sem modo/bloco Hermes: só o Credit (inalterado).
// Modo desconhecido nunca desliga o Credit.
func planoExecucao(c *Config) (credit, hermes, exclusivo bool) {
	exclusivo = c.Modo == modoHermes
	return !exclusivo, exclusivo || c.Hermes != nil, exclusivo
}

func (c *Config) hermesResolvida() ConfigHermes {
	var h ConfigHermes
	if c.Hermes != nil {
		h = *c.Hermes
	}
	if h.DirHermes == "" {
		h.DirHermes = "/var/lib/hermes"
	}
	if h.DirLicenca == "" {
		h.DirLicenca = filepath.Join(h.DirHermes, "licenca")
	}
	if h.HermesImagem == "" {
		h.HermesImagem = "/usr/local/bin/hermes-imagem"
	}
	if h.Container == "" {
		h.Container = "hermes"
	}
	if h.ArqModelo == "" {
		h.ArqModelo = "/etc/hermes/modelo"
	}
	return h
}
