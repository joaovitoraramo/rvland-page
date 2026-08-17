package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Config persistida em /etc/rvland/agent.conf. `Enderecos` é uma lista tentada
// em ordem — permite migrar de domínio no futuro sem recompilar o agente.
type Config struct {
	Enderecos  []string `json:"enderecos"`
	ServidorID string   `json:"servidor_id"`
	Driver     string   `json:"driver"` // "systemd" | "dry"
	SeedB64    string   `json:"-"`      // vive em arquivo separado, não no conf
}

func dirConf() string {
	if d := os.Getenv("RVLAND_CONF_DIR"); d != "" {
		return d
	}
	return "/etc/rvland"
}

func dirState() string {
	if d := os.Getenv("RVLAND_STATE_DIR"); d != "" {
		return d
	}
	return "/var/lib/rvland"
}

func caminhoConf() string { return filepath.Join(dirConf(), "agent.conf") }
func caminhoChave() string { return filepath.Join(dirConf(), "agente.key") }
func caminhoLease() string { return filepath.Join(dirState(), "licenca.json") }

func carregaConfig() (*Config, error) {
	b, err := os.ReadFile(caminhoConf())
	if err != nil {
		return nil, err
	}
	var c Config
	if err := json.Unmarshal(b, &c); err != nil {
		return nil, err
	}
	if c.Driver == "" {
		c.Driver = "systemd"
	}
	if seed, err := os.ReadFile(caminhoChave()); err == nil {
		c.SeedB64 = string(trimEspaco(seed))
	}
	return &c, nil
}

func salvaConfig(c *Config) error {
	if err := os.MkdirAll(dirConf(), 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(dirState(), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(caminhoConf(), b, 0o644); err != nil {
		return err
	}
	if c.SeedB64 != "" {
		if err := os.WriteFile(caminhoChave(), []byte(c.SeedB64+"\n"), 0o600); err != nil {
			return err
		}
	}
	return nil
}

func trimEspaco(b []byte) []byte {
	i, j := 0, len(b)
	for i < j && (b[i] == ' ' || b[i] == '\n' || b[i] == '\r' || b[i] == '\t') {
		i++
	}
	for j > i && (b[j-1] == ' ' || b[j-1] == '\n' || b[j-1] == '\r' || b[j-1] == '\t') {
		j--
	}
	return b[i:j]
}
