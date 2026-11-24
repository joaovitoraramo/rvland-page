package hermesinst

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// ── validação das 6 perguntas (mesmas regras do install.sh) ──

func TestIPv4Valido(t *testing.T) {
	bons := []string{"192.168.1.230", "0.0.0.0", "255.255.255.255", "10.0.0.1"}
	ruins := []string{"", "256.1.1.1", "1.2.3", "1.2.3.4.5", "a.b.c.d", "1.2.3.4 ", "1234.1.1.1", "::1", "1.2.3.-4", "cliente.ddns.com.br"}
	for _, s := range bons {
		if !IPv4Valido(s) {
			t.Errorf("IPv4Valido(%q) = false, esperado true", s)
		}
	}
	for _, s := range ruins {
		if IPv4Valido(s) {
			t.Errorf("IPv4Valido(%q) = true, esperado false", s)
		}
	}
}

func TestPortaValida(t *testing.T) {
	for _, s := range []string{"1", "8080", "65381", "65535"} {
		if !PortaValida(s) {
			t.Errorf("PortaValida(%q) = false", s)
		}
	}
	for _, s := range []string{"", "0", "65536", "-1", "80a", " 80", "99999999999999999999"} {
		if PortaValida(s) {
			t.Errorf("PortaValida(%q) = true", s)
		}
	}
}

func TestHostValido(t *testing.T) {
	for _, s := range []string{"aramo-ourobrancomatriz.ddns.com.br", "192.168.0.10", "servidor", "a-b.c"} {
		if !HostValido(s) {
			t.Errorf("HostValido(%q) = false", s)
		}
	}
	for _, s := range []string{"", "-a.com", "a-.com", "a..b", "http://x", "a b", "x;rm", strings.Repeat("a", 64) + ".com", "a.com/"} {
		if HostValido(s) {
			t.Errorf("HostValido(%q) = true", s)
		}
	}
}

func TestSimNao(t *testing.T) {
	casos := []struct {
		entrada string
		padrao  bool
		valor   bool
		ok      bool
	}{
		{"", false, false, true},
		{"", true, true, true},
		{"s", false, true, true},
		{"SIM", false, true, true},
		{"y", false, true, true},
		{"Yes", false, true, true},
		{"n", true, false, true},
		{"nao", true, false, true},
		{"no", true, false, true},
		{"talvez", false, false, false},
	}
	for _, c := range casos {
		v, ok := SimNao(c.entrada, c.padrao)
		if v != c.valor || ok != c.ok {
			t.Errorf("SimNao(%q,%v) = (%v,%v), esperado (%v,%v)", c.entrada, c.padrao, v, ok, c.valor, c.ok)
		}
	}
}

func TestLimparResposta(t *testing.T) {
	if got := LimparResposta(" 192.168.1.2 \r\n\t"); got != "192.168.1.2" {
		t.Fatalf("LimparResposta = %q", got)
	}
}

func TestCNPJValido(t *testing.T) {
	for _, s := range []string{"11222333000181", "11.222.333/0001-81"} {
		if !CNPJValido(s) {
			t.Errorf("CNPJValido(%q) = false", s)
		}
	}
	for _, s := range []string{"", "11222333000180", "11111111111111", "1122233300018", "abc"} {
		if CNPJValido(s) {
			t.Errorf("CNPJValido(%q) = true", s)
		}
	}
}

func TestFormatoChave(t *testing.T) {
	ok := "hmk_" + strings.Repeat("A", 43)
	if !FormatoChaveValido(ok) {
		t.Fatal("chave válida recusada")
	}
	for _, s := range []string{"", "hmk_curta", "xmk_" + strings.Repeat("A", 43), ok + "A", "hmk_" + strings.Repeat("A", 42) + "!"} {
		if FormatoChaveValido(s) {
			t.Errorf("FormatoChaveValido(%q) = true", s)
		}
	}
}

// ── mascaramento de segredos ──

func TestMascaradorTiraSegredosEChaveHmk(t *testing.T) {
	m := NovoMascarador()
	m.Adicionar("tok-enroll-123456")
	chave := "hmk_" + strings.Repeat("Z", 43)
	got := m.Mascarar("a chave " + chave + " e o token tok-enroll-123456 vazaram")
	if strings.Contains(got, chave) || strings.Contains(got, "tok-enroll-123456") || strings.Contains(got, "hmk_ZZ") {
		t.Fatalf("segredo vazou: %q", got)
	}
	if !strings.Contains(got, "***") {
		t.Fatalf("esperava marcador ***: %q", got)
	}
	m.Adicionar("ab") // curto demais: não mascara (evita trocar tudo)
	if m.Mascarar("abacate") != "abacate" {
		t.Fatal("segredo curto não deveria mascarar")
	}
}

func TestEscritorMascaradoJuntaPedacosAteAQuebraDeLinha(t *testing.T) {
	m := NovoMascarador()
	m.Adicionar("segredo-quebrado-XYZ")
	var b bytes.Buffer
	w := m.Escritor(&b)
	_, _ = w.Write([]byte("linha com segredo-que"))
	_, _ = w.Write([]byte("brado-XYZ no meio\nresto sem quebra"))
	w.Flush()
	if strings.Contains(b.String(), "segredo-quebrado-XYZ") {
		t.Fatalf("segredo dividido entre Writes vazou: %q", b.String())
	}
	if !strings.Contains(b.String(), "resto sem quebra") {
		t.Fatalf("Flush não escreveu o resto: %q", b.String())
	}
}

// ── prova de adoção: vetor cruzado com lib/hermes/assinatura-agente.ts (gerado com npx tsx) ──

// Vetor gerado em 24/11/2026 com `npx tsx` chamando assinarPedidoHermes("ativacao", ts,
// instalacao_id + "\n" + machine_id_hash, seed) e conferido com verificarPedidoHermes (ok=true).
// Seed de TESTE (bytes 0x00..0x1f): não é chave de produção.
const (
	vetorSeedB64    = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
	vetorPubB64     = "A6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg="
	vetorInstalacao = "3f6c1a2e-8b4d-4e2f-9a1b-7c5d3e2f1a0b"
	vetorMachineID  = "0123456789abcdef0123456789abcdef"
	vetorMIH        = "3eb1bd439947eb762998e566ccc2e099c791118b2f40579cc4f7da2b5061b7f9"
	vetorTs         = "2026-11-24T12:00:00.000Z"
	vetorMensagem   = "hermes:ativacao:2026-11-24T12:00:00.000Z.55f9d9f52e89ae3562ee1decda4ffb2ed57e5d19794db181848a707ba6cf9ab6"
	vetorAssinatura = "4Ko74V+wqZjfhtJ3C87TPW2vHkObYYIl0CR8/n3GziGC7zf8ehDdBcdeBSDI2LVHLAANON3nrigNq14bf7yzBw=="
	vetorTsInstante = 1795521600 // 2026-11-24T12:00:00Z
)

func TestProvaAdocaoVetorCruzadoComTS(t *testing.T) {
	msg := MensagemHermes("ativacao", vetorTs, []byte(vetorInstalacao+"\n"+vetorMIH))
	if string(msg) != vetorMensagem {
		t.Fatalf("mensagem = %q\nesperada  %q", msg, vetorMensagem)
	}
	sig, err := ProvaAdocao(vetorInstalacao, vetorMIH, vetorTs, vetorSeedB64)
	if err != nil {
		t.Fatal(err)
	}
	if sig != vetorAssinatura {
		t.Fatalf("assinatura = %s\nesperada    %s", sig, vetorAssinatura)
	}
	pub, _ := base64.StdEncoding.DecodeString(vetorPubB64)
	raw, _ := base64.StdEncoding.DecodeString(sig)
	if !ed25519.Verify(pub, []byte(vetorMensagem), raw) {
		t.Fatal("assinatura não verifica com a pública do vetor")
	}
	if _, err := ProvaAdocao(vetorInstalacao, vetorMIH, vetorTs, "curta"); err == nil {
		t.Fatal("seed inválida deveria falhar")
	}
}

func TestFormatoTs(t *testing.T) {
	ts := time.Unix(vetorTsInstante, 0).In(time.FixedZone("X", -3*3600))
	if got := FormatoTs(ts); got != vetorTs {
		t.Fatalf("FormatoTs = %q", got)
	}
}

func TestMachineIDHashMesmaDefinicaoDoAgente(t *testing.T) {
	raiz := t.TempDir()
	if err := os.MkdirAll(filepath.Join(raiz, "etc"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(raiz, "etc", "machine-id"), []byte("  "+vetorMachineID+"\n"), 0o444); err != nil {
		t.Fatal(err)
	}
	got, novo, err := MachineID(raiz)
	if err != nil || got != vetorMIH || novo != "" {
		t.Fatalf("MachineID = %q, %q, %v; esperado %q", got, novo, err, vetorMIH)
	}
}

func TestMachineIDFallbackDbusEAleatorioSoPersistidoPeloChamador(t *testing.T) {
	raiz := t.TempDir()
	_ = os.MkdirAll(filepath.Join(raiz, "var", "lib", "dbus"), 0o755)
	_ = os.WriteFile(filepath.Join(raiz, "var", "lib", "dbus", "machine-id"), []byte(vetorMachineID), 0o444)
	if got, _, _ := MachineID(raiz); got != vetorMIH {
		t.Fatalf("fallback dbus = %q", got)
	}

	vazio := t.TempDir()
	h1, novo, err := MachineID(vazio)
	if err != nil || len(h1) != 64 || len(novo) != 32 || h1 != sha256Hex([]byte(novo)) {
		t.Fatalf("aleatório: %q %q %v", h1, novo, err)
	}
	if ents, _ := os.ReadDir(vazio); len(ents) != 0 {
		t.Fatal("MachineID gravou no disco")
	}
	if err := persistirMachineID(vazio, novo); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(vazio, "var", "lib", "rvland", "hermes-machine-id")
	if fi, err := os.Stat(p); err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("id persistido em %s (0600): %v", p, err)
	}
	if h2, n2, _ := MachineID(vazio); h2 != h1 || n2 != "" {
		t.Fatal("depois de persistido, o id deve ser lido (o agente lê o mesmo arquivo)")
	}
}

// ── verificação de release (sha256 + Ed25519 com a chave de release embutida) ──

func TestVerificarRelease(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(nil)
	pubB64 := base64.StdEncoding.EncodeToString(pub)
	bin := []byte("binario do agente")
	h := sha256.Sum256(bin)
	sha := hex.EncodeToString(h[:])
	sig := base64.StdEncoding.EncodeToString(ed25519.Sign(priv, bin))

	if err := VerificarRelease(bin, sha, sig, pubB64); err != nil {
		t.Fatalf("release válida recusada: %v", err)
	}
	if err := VerificarRelease(bin, strings.Repeat("0", 64), sig, pubB64); err == nil {
		t.Fatal("sha256 errado aceito")
	}
	if err := VerificarRelease(bin, strings.ToUpper(sha), sig, pubB64); err != nil {
		t.Fatal("sha256 em maiúsculas deveria valer (hex)")
	}
	outro := base64.StdEncoding.EncodeToString(ed25519.Sign(priv, []byte("outro")))
	if err := VerificarRelease(bin, sha, outro, pubB64); err == nil {
		t.Fatal("assinatura inválida aceita")
	}
	if err := VerificarRelease(bin, sha, sig, ""); err == nil {
		t.Fatal("sem chave de release embutida: deveria recusar")
	}
	if err := VerificarRelease(bin, "", sig, pubB64); err == nil {
		t.Fatal("sha vazio aceito")
	}
}

func TestLerLimitado(t *testing.T) {
	if _, err := LerLimitado(strings.NewReader("12345"), 4); err == nil {
		t.Fatal("acima do limite deveria falhar")
	}
	b, err := LerLimitado(strings.NewReader("1234"), 4)
	if err != nil || string(b) != "1234" {
		t.Fatalf("no limite: %q %v", b, err)
	}
}
