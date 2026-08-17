package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Envelope do lease (base64(payload) + assinatura), verificado com licensePK.
type LeaseEnvelope struct {
	Payload    string `json:"payload"`
	Assinatura string `json:"assinatura"`
}

type ComandoPend struct {
	ID             string `json:"id"`
	Verbo          string `json:"verbo"`
	ServicoUnidade string `json:"servico_unidade"`
}

type RespEnroll struct {
	ServidorID  string        `json:"servidor_id"`
	Licenca     LeaseEnvelope `json:"licenca"`
	IntervaloS  int           `json:"intervalo_seg"`
}

type RespHeartbeat struct {
	Licenca    LeaseEnvelope `json:"licenca"`
	Comandos   []ComandoPend `json:"comandos"`
	VersaoAlvo string        `json:"versao_alvo"`
	IntervaloS int           `json:"intervalo_seg"`
}

var httpCli = &http.Client{Timeout: 20 * time.Second}

// tentaEnderecos executa fn em cada endereço até um dar certo (troca de domínio).
func tentaEnderecos(enderecos []string, fn func(base string) error) error {
	var ultimo error
	for _, base := range enderecos {
		if err := fn(base); err != nil {
			ultimo = err
			continue
		}
		return nil
	}
	if ultimo == nil {
		ultimo = fmt.Errorf("nenhum endereço configurado")
	}
	return ultimo
}

func postJSON(url string, corpo []byte, headers map[string]string) ([]byte, int, error) {
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(corpo))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := httpCli.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return b, resp.StatusCode, nil
}

func doEnroll(base, token, pubB64, host, so, versao string) (*RespEnroll, error) {
	corpo, _ := json.Marshal(map[string]string{
		"token":         token,
		"agente_pubkey": pubB64,
		"host":          host,
		"so":            so,
		"agente_versao": versao,
	})
	b, status, err := postJSON(base+"/api/agente/enroll", corpo, nil)
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, fmt.Errorf("enroll falhou (%d): %s", status, string(b))
	}
	var r RespEnroll
	if err := json.Unmarshal(b, &r); err != nil {
		return nil, err
	}
	return &r, nil
}

func doHeartbeat(base, servidorID, seedB64 string, corpo []byte) (*RespHeartbeat, error) {
	ts := time.Now().UTC().Format(time.RFC3339)
	sig, err := assina(mensagemHeartbeat(ts, corpo), seedB64)
	if err != nil {
		return nil, err
	}
	b, status, err := postJSON(base+"/api/agente/heartbeat", corpo, map[string]string{
		"X-RVLand-Servidor":   servidorID,
		"X-RVLand-Timestamp":  ts,
		"X-RVLand-Assinatura": sig,
	})
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, fmt.Errorf("heartbeat falhou (%d): %s", status, string(b))
	}
	var r RespHeartbeat
	if err := json.Unmarshal(b, &r); err != nil {
		return nil, err
	}
	return &r, nil
}

func baixaBinario(base, versao, arch string) ([]byte, error) {
	url := fmt.Sprintf("%s/api/agente/binario?versao=%s&arch=%s", base, versao, arch)
	resp, err := httpCli.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("download falhou (%d)", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}
