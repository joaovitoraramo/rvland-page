package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// adiarAutoUpdate é registrado pelo módulo Hermes (iniciaHermes); nil no agente sem Hermes.
var adiarAutoUpdate func() bool

// Pontos de troca só para os testes (o comportamento é o de sempre: os.Executable e os.Exit).
var (
	executavelAgente = os.Executable
	sairAgente       = os.Exit
)

type metaRelease struct {
	Versao     string `json:"versao"`
	SHA256     string `json:"sha256"`
	Assinatura string `json:"assinatura"`
}

// autoAtualiza baixa, verifica (sha256 + assinatura de release) e troca o
// binário de forma atômica. O systemd reinicia o serviço quando o processo sai.
// O download é assinado com a chave do servidor (cfg) para o painel autenticar.
func autoAtualiza(cfg *Config, versaoAlvo, versaoAtual string) error {
	if versaoAlvo == "" || versaoAlvo == versaoAtual {
		return nil
	}
	// Servidor com o ciclo Hermes: não reinicia o agente enquanto o hermes-imagem roda (o restart
	// cortaria o update do container no meio). nil = agente sem Hermes, comportamento de sempre.
	if adiarAutoUpdate != nil && adiarAutoUpdate() {
		return fmt.Errorf("atualização para %s adiada: atualização do Hermes em andamento", versaoAlvo)
	}
	base := cfg.Enderecos[0]
	arch := runtime.GOARCH
	logf("atualização %s → %s (%s)...", versaoAtual, versaoAlvo, arch)

	// metadados (sha256 + assinatura)
	b, status, err := postJSONGet(base + "/api/agente/release?versao=" + versaoAlvo + "&arch=" + arch)
	if err != nil {
		return err
	}
	if status != 200 {
		return fmt.Errorf("meta indisponível (%d)", status)
	}
	var meta metaRelease
	if err := json.Unmarshal(b, &meta); err != nil {
		return err
	}

	// binário (pedido assinado com a chave do servidor)
	bin, err := baixaBinario(base, versaoAlvo, arch, cfg.ServidorID, cfg.SeedB64)
	if err != nil {
		return err
	}
	if sha256Hex(bin) != meta.SHA256 {
		return fmt.Errorf("sha256 não confere")
	}
	if !verificaComPub(bin, meta.Assinatura, releasePK) {
		return fmt.Errorf("assinatura de release não confere")
	}

	// troca atômica: grava temp no mesmo diretório, rename por cima, guarda .bak
	exe, err := executavelAgente()
	if err != nil {
		return err
	}
	exe, _ = filepath.EvalSymlinks(exe)
	tmp := exe + ".novo"
	if err := os.WriteFile(tmp, bin, 0o755); err != nil {
		return err
	}
	// reconfere: um hermes_update pode ter começado durante o download (TOCTOU)
	if adiarAutoUpdate != nil && adiarAutoUpdate() {
		_ = os.Remove(tmp)
		return fmt.Errorf("atualização para %s adiada: atualização do Hermes começou durante o download", versaoAlvo)
	}
	_ = os.Rename(exe, exe+".bak")
	if err := os.Rename(tmp, exe); err != nil {
		_ = os.Rename(exe+".bak", exe) // rollback
		return err
	}
	logf("atualizado para %s — reiniciando", versaoAlvo)
	sairAgente(0) // systemd reinicia com o binário novo
	return nil
}

func postJSONGet(url string) ([]byte, int, error) {
	resp, err := httpCli.Get(url)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	b := make([]byte, 0, 512)
	buf := make([]byte, 512)
	for {
		n, e := resp.Body.Read(buf)
		b = append(b, buf[:n]...)
		if e != nil {
			break
		}
	}
	return b, resp.StatusCode, nil
}
