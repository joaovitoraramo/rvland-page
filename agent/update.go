package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

type metaRelease struct {
	Versao     string `json:"versao"`
	SHA256     string `json:"sha256"`
	Assinatura string `json:"assinatura"`
}

// autoAtualiza baixa, verifica (sha256 + assinatura de release) e troca o
// binário de forma atômica. O systemd reinicia o serviço quando o processo sai.
func autoAtualiza(base, versaoAlvo, versaoAtual string) error {
	if versaoAlvo == "" || versaoAlvo == versaoAtual {
		return nil
	}
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

	// binário
	bin, err := baixaBinario(base, versaoAlvo, arch)
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
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, _ = filepath.EvalSymlinks(exe)
	tmp := exe + ".novo"
	if err := os.WriteFile(tmp, bin, 0o755); err != nil {
		return err
	}
	_ = os.Rename(exe, exe+".bak")
	if err := os.Rename(tmp, exe); err != nil {
		_ = os.Rename(exe+".bak", exe) // rollback
		return err
	}
	logf("atualizado para %s — reiniciando", versaoAlvo)
	os.Exit(0) // systemd reinicia com o binário novo
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
