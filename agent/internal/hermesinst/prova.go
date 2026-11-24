package hermesinst

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math/big"
	"strings"
	"time"
)

func sha256Hex(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

// MensagemHermes: `hermes:<rota>:<timestamp>.<sha256_hex(corpo)>` (lib/hermes/assinatura-agente.ts).
func MensagemHermes(rota, ts string, corpo []byte) []byte {
	return []byte("hermes:" + rota + ":" + ts + "." + sha256Hex(corpo))
}

// ProvaAdocao assina `hermes:ativacao:<ts>.<sha256hex(instalacao_id + "\n" + machine_id_hash)>`
// com a seed (base64, 32 bytes) do agente RV já instalado.
func ProvaAdocao(instalacaoID, machineIDHash, ts, seedB64 string) (string, error) {
	seed, err := base64.StdEncoding.DecodeString(seedB64)
	if err != nil || len(seed) != ed25519.SeedSize {
		return "", errors.New("chave do agente inválida")
	}
	priv := ed25519.NewKeyFromSeed(seed)
	sig := ed25519.Sign(priv, MensagemHermes("ativacao", ts, []byte(instalacaoID+"\n"+machineIDHash)))
	return base64.StdEncoding.EncodeToString(sig), nil
}

// FormatoTs: RFC 3339 UTC com milissegundos, o mesmo do agente (2026-11-23T12:00:00.000Z).
func FormatoTs(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

// MachineID: a MESMA definição do agente Go (agent/hermes_sync.go machineIDHash): sha256 hex do
// /etc/machine-id sem espaços (fallback /var/lib/dbus/machine-id; por último o id aleatório
// persistido em /var/lib/rvland/hermes-machine-id, que o agente lerá depois). NUNCA grava: sem
// nenhum deles, gera um id aleatório em memória e o devolve em `novo` para o chamador persistir
// (persistirMachineID) só DEPOIS da ativação aceita (uma saída 4 não deixa nada no disco).
func MachineID(raiz string) (hash, novo string, err error) {
	for _, p := range []string{"/etc/machine-id", "/var/lib/dbus/machine-id"} {
		if b, err := lerArquivo(raiz, p, 4096); err == nil {
			if v := strings.TrimSpace(string(b)); v != "" {
				return sha256Hex([]byte(v)), "", nil
			}
		}
	}
	if b, err := lerArquivo(raiz, arqMachineIDAgente, 4096); err == nil {
		if v := strings.TrimSpace(string(b)); len(v) >= 16 {
			return sha256Hex([]byte(v)), "", nil
		}
	}
	r := make([]byte, 16)
	if _, err := rand.Read(r); err != nil {
		return "", "", err
	}
	v := hex.EncodeToString(r)
	return sha256Hex([]byte(v)), v, nil
}

const arqMachineIDAgente = "/var/lib/rvland/hermes-machine-id"

// persistirMachineID grava o id aleatório (0600) onde o agente o procura.
func persistirMachineID(raiz, id string) error {
	if _, err := criarDirs(raiz, "/var/lib/rvland", 0o755); err != nil {
		return err
	}
	return escreverAtomico(raiz, arqMachineIDAgente, []byte(id+"\n"), 0o600)
}

// VerificarRelease: sha256 (hex) E assinatura Ed25519 de release sobre os bytes do binário, com
// a chave pública de release embutida no build (a mesma do agente: chaves/release.pub).
func VerificarRelease(bin []byte, shaEsperado, assinaturaB64, pubB64 string) error {
	if !chavePublicaReleaseValida(pubB64) {
		return errors.New("chave pública de release ausente ou inválida neste build")
	}
	pub, _ := base64.StdEncoding.DecodeString(pubB64)
	sha := strings.ToLower(strings.TrimSpace(shaEsperado))
	if len(sha) != 64 {
		return errors.New("sha256 esperado ausente ou inválido")
	}
	if sha256Hex(bin) != sha {
		return errors.New("sha256 do download não confere")
	}
	sig, err := base64.StdEncoding.DecodeString(assinaturaB64)
	if err != nil || len(sig) != ed25519.SignatureSize {
		return errors.New("assinatura de release ausente ou malformada")
	}
	if !ed25519.Verify(ed25519.PublicKey(pub), bin, sig) {
		return errors.New("assinatura de release não confere")
	}
	return nil
}

// LerLimitado lê até max bytes; passou disso = erro (download recusado).
func LerLimitado(r io.Reader, max int64) ([]byte, error) {
	b, err := io.ReadAll(io.LimitReader(r, max+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > max {
		return nil, fmt.Errorf("resposta maior que o limite de %d bytes", max)
	}
	return b, nil
}

// chavePublicaReleaseValida: base64 de 32 bytes que decodifica para um ponto da curva Ed25519
// e NÃO é de ordem pequena ([8]P != identidade). Recusa vazio, placeholder, zeros, identidade,
// pontos de ordem 2/4/8 e codificações não canônicas (y >= p): com elas uma "assinatura" pode
// valer para qualquer binário.
func chavePublicaReleaseValida(b64 string) bool {
	if len(b64) != 44 {
		return false
	}
	b, err := base64.StdEncoding.DecodeString(b64)
	if err != nil || len(b) != ed25519.PublicKeySize {
		return false
	}
	x, y, ok := decodificarPonto(b)
	if !ok {
		return false
	}
	for range 3 { // [8]P
		x, y = somarPontos(x, y, x, y)
	}
	return !(x.Sign() == 0 && y.Cmp(big.NewInt(1)) == 0)
}

var (
	primoP = new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 255), big.NewInt(19))
	// d = -121665/121666 mod p
	curvaD = func() *big.Int {
		n := new(big.Int).Neg(big.NewInt(121665))
		inv := new(big.Int).ModInverse(big.NewInt(121666), primoP)
		return n.Mul(n, inv).Mod(n, primoP)
	}()
	raizMenos1 = new(big.Int).Exp(big.NewInt(2), new(big.Int).Div(new(big.Int).Sub(primoP, big.NewInt(1)), big.NewInt(4)), primoP)
)

func modp(x *big.Int) *big.Int { return x.Mod(x, primoP) }

// decodificarPonto: RFC 8032 5.1.3 (y em little-endian, bit 255 = sinal de x).
func decodificarPonto(b []byte) (*big.Int, *big.Int, bool) {
	le := make([]byte, 32)
	for i := range 32 {
		le[31-i] = b[i]
	}
	sinal := le[0] >> 7
	le[0] &= 0x7f
	y := new(big.Int).SetBytes(le)
	if y.Cmp(primoP) >= 0 {
		return nil, nil, false
	}
	y2 := modp(new(big.Int).Mul(y, y))
	u := modp(new(big.Int).Sub(y2, big.NewInt(1)))
	v := modp(new(big.Int).Add(new(big.Int).Mul(curvaD, y2), big.NewInt(1)))
	x2 := modp(new(big.Int).Mul(u, new(big.Int).ModInverse(v, primoP)))
	exp := new(big.Int).Div(new(big.Int).Add(primoP, big.NewInt(3)), big.NewInt(8))
	x := new(big.Int).Exp(x2, exp, primoP)
	if modp(new(big.Int).Mul(x, x)).Cmp(x2) != 0 {
		x = modp(x.Mul(x, raizMenos1))
		if modp(new(big.Int).Mul(x, x)).Cmp(x2) != 0 {
			return nil, nil, false
		}
	}
	if x.Sign() == 0 && sinal == 1 {
		return nil, nil, false
	}
	if uint8(x.Bit(0)) != sinal {
		x = new(big.Int).Sub(primoP, x)
	}
	return x, y, true
}

// somarPontos: adição afim em -x^2 + y^2 = 1 + d x^2 y^2 (completa para a = -1, d não quadrado).
func somarPontos(x1, y1, x2, y2 *big.Int) (*big.Int, *big.Int) {
	t := modp(new(big.Int).Mul(curvaD, modp(new(big.Int).Mul(modp(new(big.Int).Mul(x1, x2)), modp(new(big.Int).Mul(y1, y2))))))
	nx := modp(new(big.Int).Add(new(big.Int).Mul(x1, y2), new(big.Int).Mul(y1, x2)))
	ny := modp(new(big.Int).Add(new(big.Int).Mul(y1, y2), new(big.Int).Mul(x1, x2)))
	dx := new(big.Int).ModInverse(modp(new(big.Int).Add(big.NewInt(1), t)), primoP)
	dy := new(big.Int).ModInverse(modp(new(big.Int).Sub(big.NewInt(1), t)), primoP)
	return modp(nx.Mul(nx, dx)), modp(ny.Mul(ny, dy))
}
