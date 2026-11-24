package hermesinst

import (
	"encoding/base64"
	"encoding/json"
	"strings"
)

// confAgente: o que o instalador lê do /etc/rvland/agent.conf (agent/config.go).
type confAgente struct {
	ServidorID string `json:"servidor_id"`
	Modo       string `json:"modo"`
	Hermes     *struct {
		InstalacaoID string `json:"instalacao_id"`
		Canal        string `json:"canal"`
	} `json:"hermes"`
}

func (c *confAgente) instalacao() string {
	if c == nil || c.Hermes == nil {
		return ""
	}
	return c.Hermes.InstalacaoID
}

func (c *confAgente) canal() string {
	if c == nil || c.Hermes == nil || !CanalValido(c.Hermes.Canal) {
		return "stable"
	}
	return c.Hermes.Canal
}

// estado: o que já existe no servidor (somente leitura).
type estado struct {
	agenteConf   bool
	agente       confAgente
	unit         bool
	hermesConfig bool
	installDir   string
	modeloImagem bool
	envExiste    bool
	envTexto     string
	hook         bool
	hermesImagem bool
}

func (i *instalador) detectar() (*estado, error) {
	r := i.a.Raiz
	e := &estado{installDir: dirInstalacao}
	if existe(r, arqAgenteConf) {
		b, err := lerArquivo(r, arqAgenteConf, 1<<20)
		if err != nil || json.Unmarshal(b, &e.agente) != nil {
			return nil, falha(SaidaPreRequisito, "%s ilegível ou fora do formato; corrija o agente RV antes de continuar", arqAgenteConf)
		}
		e.agenteConf = true
	}
	e.unit = existe(r, arqUnit)
	if existe(r, arqConfig) {
		e.hermesConfig = true
		b, err := lerArquivo(r, arqConfig, 1<<20)
		if err != nil {
			return nil, falha(SaidaPreRequisito, "%s ilegível: %v", arqConfig, err)
		}
		if e.installDir = installDirDoConfig(string(b)); e.installDir == "" {
			return nil, falha(SaidaPreRequisito, "INSTALL_DIR inválido em %s", arqConfig)
		}
	}
	if b, err := lerArquivo(r, arqModelo, 4096); err == nil {
		e.modeloImagem = strings.TrimSpace(string(b)) == "imagem"
	}
	if b, err := lerArquivo(r, e.installDir+"/.env.production", 1<<20); err == nil {
		e.envExiste, e.envTexto = true, string(b)
	}
	e.hook = existe(r, arqHook)
	e.hermesImagem = existe(r, arqHermesImagem)
	return e, nil
}

func (e *estado) envPath() string { return e.installDir + "/.env.production" }

// hermesCompleto: modelo imagem, .env com HERMES_INSTALACAO_ID=<id> SEM aspas, hook e hermes-imagem.
func (e *estado) hermesCompleto(id string) bool {
	if id == "" || !e.modeloImagem || !e.envExiste || !e.hook || !e.hermesImagem {
		return false
	}
	v, ok := valorVariavel(e.envTexto, "HERMES_INSTALACAO_ID")
	return ok && v == id
}

// chaveDoAgente: servidor e seed do agente já instalado (para a prova de adoção). A seed fica
// só em memória e entra no mascarador.
func (i *instalador) chaveDoAgente(e *estado) (servidorID, seed string, err error) {
	if !UUIDValido(strings.ToLower(e.agente.ServidorID)) {
		return "", "", falha(SaidaPreRequisito, "%s sem servidor_id válido", arqAgenteConf)
	}
	b, err := lerArquivo(i.a.Raiz, arqAgenteChave, 4096)
	if err != nil {
		return "", "", falha(SaidaPreRequisito, "não consegui ler a chave do agente (%s): %v", arqAgenteChave, err)
	}
	seed = strings.TrimSpace(string(b))
	i.m.Adicionar(seed)
	if raw, err := base64.StdEncoding.DecodeString(seed); err != nil || len(raw) != 32 {
		return "", "", falha(SaidaPreRequisito, "chave do agente em %s fora do formato", arqAgenteChave)
	}
	return strings.ToLower(e.agente.ServidorID), seed, nil
}
