package main

import (
	"testing"
	"time"
)

// A assinatura do pedido de download usa o MESMO esquema do heartbeat
// (timestamp + "." + sha256(corpo)) sobre mensagemDownload(versao, arch). O
// painel (lib/servicos/download-auth.ts) verifica igual. Este teste garante que
// o corpo canônico e a verificação casam — e que trocar versao/arch invalida.
func TestAssinaturaDownload(t *testing.T) {
	seedB64, pubB64 := geraChaveAgente()
	ts := time.Now().UTC().Format(time.RFC3339)

	sig, err := assina(mensagemHeartbeat(ts, mensagemDownload("0.6.0", "amd64")), seedB64)
	if err != nil {
		t.Fatal(err)
	}

	// mesma versao/arch verifica
	if !verificaComPub(mensagemHeartbeat(ts, mensagemDownload("0.6.0", "amd64")), sig, pubB64) {
		t.Fatal("assinatura do download deveria verificar")
	}
	// recurso diferente não verifica
	if verificaComPub(mensagemHeartbeat(ts, mensagemDownload("0.7.0", "arm64")), sig, pubB64) {
		t.Fatal("assinatura não deveria valer para outro versao/arch")
	}
}

func TestMensagemDownloadCanonica(t *testing.T) {
	if string(mensagemDownload("0.6.0", "amd64")) != "download:0.6.0:amd64" {
		t.Fatalf("corpo canônico inesperado: %q", string(mensagemDownload("0.6.0", "amd64")))
	}
}
