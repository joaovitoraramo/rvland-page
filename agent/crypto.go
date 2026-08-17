package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
)

// Chaves públicas embutidas no build (via -ldflags -X). licensePK verifica o
// lease; releasePK verifica os binários de atualização.
var (
	licensePK string
	releasePK string
)

// geraChaveAgente cria o par do agente. Retorna (seedB64, pubB64).
func geraChaveAgente() (string, string) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		panic(err)
	}
	seed := priv.Seed() // 32 bytes, formato compatível com o Node/plataforma
	return base64.StdEncoding.EncodeToString(seed),
		base64.StdEncoding.EncodeToString(pub)
}

// assina uma mensagem com a seed do agente (base64).
func assina(mensagem []byte, seedB64 string) (string, error) {
	seed, err := base64.StdEncoding.DecodeString(seedB64)
	if err != nil || len(seed) != ed25519.SeedSize {
		return "", errors.New("seed inválida")
	}
	priv := ed25519.NewKeyFromSeed(seed)
	sig := ed25519.Sign(priv, mensagem)
	return base64.StdEncoding.EncodeToString(sig), nil
}

// verificaComPub verifica assinatura base64 com uma chave pública base64.
func verificaComPub(mensagem []byte, sigB64, pubB64 string) bool {
	pub, err := base64.StdEncoding.DecodeString(pubB64)
	if err != nil || len(pub) != ed25519.PublicKeySize {
		return false
	}
	sig, err := base64.StdEncoding.DecodeString(sigB64)
	if err != nil || len(sig) != ed25519.SignatureSize {
		return false
	}
	return ed25519.Verify(ed25519.PublicKey(pub), mensagem, sig)
}

// mensagemHeartbeat monta `timestamp + "." + sha256hex(body)` — o mesmo que a
// plataforma verifica em lib/crypto/heartbeat-auth.ts.
func mensagemHeartbeat(timestamp string, body []byte) []byte {
	h := sha256.Sum256(body)
	return []byte(fmt.Sprintf("%s.%s", timestamp, hex.EncodeToString(h[:])))
}

func sha256Hex(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}
