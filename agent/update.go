package main

import (
	"encoding/json"
	"fmt"
	"runtime"
)

type metaRelease struct {
	Versao     string `json:"versao"`
	SHA256     string `json:"sha256"`
	Assinatura string `json:"assinatura"`
}

// autoAtualiza baixa, verifica (sha256 + assinatura de release) e troca o
// binário (trocaBinario é por SO: update_unix.go / update_windows.go). O
// systemd ou o Gerenciador de Serviços reinicia o processo quando ele sai.
func autoAtualiza(base, versaoAlvo, versaoAtual string) error {
	if versaoAlvo == "" || versaoAlvo == versaoAtual {
		return nil
	}
	// versão que já falhou neste servidor (só o Windows registra): nem baixa
	if contem(versoesRecusadas(), versaoAlvo) {
		return nil
	}
	arch := runtime.GOARCH
	logf("atualização %s → %s (%s)...", versaoAtual, versaoAlvo, arch)

	// metadados (sha256 + assinatura)
	b, status, err := postJSONGet(base + "/api/agente/release?versao=" + versaoAlvo + "&arch=" + arch + parametroSO())
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

	return trocaBinario(bin, versaoAlvo)
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
