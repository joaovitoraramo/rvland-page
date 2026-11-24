package main

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// VETOR CRUZADO (chave de TESTE pública, nunca a de produção): o mesmo de
// lib/crypto/hermes-vetor.test.ts (RVLand) e src/lib/fixtures/vetor-rvland.json (Hermes).
// Se mudar lá, muda aqui: é o contrato do documento entre o RVLand, o agente e o container.
const (
	vetorSeedB64    = "N8/J3suRQZe3wLpwNhOiR8eO2xtU8S3500WYra+nbaA="
	vetorPubB64     = "MYUyj+tMTtw8XTHK46wM4NoafLV7XKL7fH/uCgUZxqc="
	vetorAgora      = "2026-11-23T12:00:00.000Z"
	vetorInstalacao = "inst-vetor-1"
	vetorServidor   = "srv-vetor-1"
	vetorPayload    = "eyJ0aXBvIjoiaGVybWVzX2xpY2VuY2EiLCJ2IjoxLCJraWQiOiJoMSIsImluc3RhbGFjYW9faWQiOiJpbnN0LXZldG9yLTEiLCJzZXJ2aWRvcl9pZCI6InNydi12ZXRvci0xIiwiY2xpZW50ZV9pZCI6ImNsaS12ZXRvci0xIiwiY25waiI6IjEyMzQ1Njc4MDAwMTkwIiwiZW1pdGlkb19lbSI6IjIwMjYtMTEtMjBUMTI6MDA6MDAuMDAwWiIsInN0YXR1cyI6ImF0aXZhIiwib3JpZ2VtIjoiY29udHJhdG8iLCJleHBpcmFfZW0iOiIyMDI2LTEyLTIwIiwiY2FyZW5jaWFfYXRlIjoiMjAyNi0xMi0yMyIsIm9wZXJhcl9hdGUiOiIyMDI2LTEyLTI0VDA2OjAwOjAwLjAwMFoiLCJvZmZsaW5lX2F0ZSI6IjIwMjYtMTItMjdUMDY6MDA6MDAuMDAwWiIsIm1vZG8iOiJ2YWxlbmRvIiwib2JyaWdhdG9yaWEiOnRydWUsImNhbmFsIjoic3RhYmxlIiwiYXZpc28iOm51bGwsInBhbmljbyI6ZmFsc2UsImJsb3F1ZWFudGUiOmZhbHNlfQ=="
	vetorAssinatura = "m16f1O3uMLZSNgTFRjW3+uET97u3MFpMGgigW15NES7u6poxa1hCf2QjMig7DOWwAc5WaUbjVRIXoEYNbtCzBw=="
)

func vetorEnvelope() []byte {
	return []byte(`{"payload":"` + vetorPayload + `","assinatura":"` + vetorAssinatura + `","kid":"h1"}`)
}

func tempo(t *testing.T, s string) time.Time {
	t.Helper()
	v, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func opVetor(t *testing.T) opcoesDoc {
	return opcoesDoc{
		chaves:       map[string]string{"h1": vetorPubB64},
		agora:        tempo(t, vetorAgora),
		instalacaoID: vetorInstalacao,
		servidorID:   vetorServidor,
	}
}

// payloadVetor devolve o documento do vetor como mapa (para variar campos nos testes).
func payloadVetor(t *testing.T) map[string]any {
	t.Helper()
	b, _ := base64.StdEncoding.DecodeString(vetorPayload)
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

// envelopeTeste assina `p` com a seed de teste (como o RVLand faria) e devolve os bytes do envelope.
func envelopeTeste(t *testing.T, p map[string]any, kid string) []byte {
	t.Helper()
	bytes, _ := json.Marshal(p)
	sig, err := assina(bytes, vetorSeedB64)
	if err != nil {
		t.Fatal(err)
	}
	env, _ := json.Marshal(map[string]string{"payload": base64.StdEncoding.EncodeToString(bytes), "assinatura": sig, "kid": kid})
	return env
}

func TestDocHermes_VetorCruzadoVerifica(t *testing.T) {
	d, err := verificarDocHermes(vetorEnvelope(), opVetor(t))
	if err != nil {
		t.Fatalf("o vetor do RVLand deveria verificar: %v", err)
	}
	if d.Status != "ativa" || d.Modo != "valendo" || !d.Obrigatoria || d.Panico || d.Bloqueante {
		t.Fatalf("campos lidos errado: %+v", d)
	}
	if d.EmitidoEm != "2026-11-20T12:00:00.000Z" || d.OfflineAte != "2026-12-27T06:00:00.000Z" || d.Canal != "stable" {
		t.Fatalf("datas/canal errados: %+v", d)
	}
	if !d.emitido.Equal(tempo(t, "2026-11-20T12:00:00Z")) || !d.offline.Equal(tempo(t, "2026-12-27T06:00:00Z")) {
		t.Fatalf("datas não parseadas: %v %v", d.emitido, d.offline)
	}
}

func TestDocHermes_RecusasDeIntegridade(t *testing.T) {
	troca := func(b64 string, i int) string {
		b, _ := base64.StdEncoding.DecodeString(b64)
		b[i] ^= 0x01
		return base64.StdEncoding.EncodeToString(b)
	}
	env := func(payload, sig, kid string) []byte {
		b, _ := json.Marshal(map[string]string{"payload": payload, "assinatura": sig, "kid": kid})
		return b
	}
	casos := map[string][]byte{
		"payload adulterado":      env(troca(vetorPayload, 5), vetorAssinatura, "h1"),
		"assinatura adulterada":   env(vetorPayload, troca(vetorAssinatura, 7), "h1"),
		"kid desconhecido":        env(vetorPayload, vetorAssinatura, "h2"),
		"kid herdado (__proto__)": env(vetorPayload, vetorAssinatura, "__proto__"),
		"payload sem padding":     env(strings.TrimRight(vetorPayload, "="), vetorAssinatura, "h1"),
		"payload com quebra":      env(vetorPayload[:10]+"\n"+vetorPayload[10:], vetorAssinatura, "h1"),
		// "...fQ==" -> "...fR==": decodifica nos MESMOS bytes num decodificador leniente, mas não é canônico
		"payload bits finais": env(strings.TrimSuffix(vetorPayload, "Q==")+"R==", vetorAssinatura, "h1"),
		"payload vazio":       env("", vetorAssinatura, "h1"),
		"assinatura curta":    env(vetorPayload, base64.StdEncoding.EncodeToString(make([]byte, 63)), "h1"),
		"não é JSON":          []byte("lixo"),
		"sem kid":             []byte(`{"payload":"` + vetorPayload + `","assinatura":"` + vetorAssinatura + `"}`),
		"payload numérico":    []byte(`{"payload":1,"assinatura":"` + vetorAssinatura + `","kid":"h1"}`),
		"grande demais":       append(vetorEnvelope(), []byte(strings.Repeat(" ", 64*1024))...),
	}
	for nome, b := range casos {
		if _, err := verificarDocHermes(b, opVetor(t)); err == nil {
			t.Errorf("%s: deveria ser recusado", nome)
		}
	}
}

func TestDocHermes_ChavePlaceholderOuAusenteNuncaVerifica(t *testing.T) {
	for _, pk := range []string{"", "SUBSTITUIR-PELA-CHAVE-PUBLICA-ED25519-BASE64-DO-RVLAND-PLACEHOLDER", "AAAA"} {
		op := opVetor(t)
		op.chaves = map[string]string{"h1": pk}
		if _, err := verificarDocHermes(vetorEnvelope(), op); err == nil {
			t.Errorf("chave %q não deveria verificar nada", pk)
		}
	}
	// chave em SPKI DER também vale (o núcleo do Hermes aceita os dois formatos)
	raw, _ := base64.StdEncoding.DecodeString(vetorPubB64)
	spki := append([]byte{0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00}, raw...)
	op := opVetor(t)
	op.chaves = map[string]string{"h1": base64.StdEncoding.EncodeToString(spki)}
	if _, err := verificarDocHermes(vetorEnvelope(), op); err != nil {
		t.Fatalf("chave SPKI deveria verificar: %v", err)
	}
}

func TestDocHermes_RecusasDeConteudo(t *testing.T) {
	casos := map[string]func(p map[string]any){
		"tipo errado":                  func(p map[string]any) { p["tipo"] = "lease" },
		"versão 2":                     func(p map[string]any) { p["v"] = 2 },
		"kid do payload diverge":       func(p map[string]any) { p["kid"] = "h2" },
		"sem emitido_em":               func(p map[string]any) { delete(p, "emitido_em") },
		"offline_ate inválido":         func(p map[string]any) { p["offline_ate"] = "amanhã" },
		"status vazio":                 func(p map[string]any) { p["status"] = "" },
		"modo desconhecido":            func(p map[string]any) { p["modo"] = "talvez" },
		"bloqueante não booleano":      func(p map[string]any) { p["bloqueante"] = "false" },
		"panico ausente":               func(p map[string]any) { delete(p, "panico") },
		"obrigatoria nula":             func(p map[string]any) { p["obrigatoria"] = nil },
		"emitido 11 min no futuro":     func(p map[string]any) { p["emitido_em"] = "2026-11-23T12:11:00.000Z" },
		"outra instalação":             func(p map[string]any) { p["instalacao_id"] = "inst-outra" },
		"outro servidor":               func(p map[string]any) { p["servidor_id"] = "srv-outro" },
		"servidor nulo":                func(p map[string]any) { p["servidor_id"] = nil },
		"payload não é objeto (lista)": nil,
	}
	for nome, muda := range casos {
		var env []byte
		if muda == nil {
			bytes := []byte(`[1,2]`)
			sig, _ := assina(bytes, vetorSeedB64)
			env, _ = json.Marshal(map[string]string{"payload": base64.StdEncoding.EncodeToString(bytes), "assinatura": sig, "kid": "h1"})
		} else {
			p := payloadVetor(t)
			muda(p)
			env = envelopeTeste(t, p, "h1")
		}
		if _, err := verificarDocHermes(env, opVetor(t)); err == nil {
			t.Errorf("%s: deveria ser recusado", nome)
		}
	}

	// emitido até 10 min no futuro é tolerado (relógio levemente adiantado)
	p := payloadVetor(t)
	p["emitido_em"] = "2026-11-23T12:10:00.000Z"
	if _, err := verificarDocHermes(envelopeTeste(t, p, "h1"), opVetor(t)); err != nil {
		t.Fatalf("10 min no futuro deveria passar: %v", err)
	}
	// sem instalação/servidor configurados, não confere o vínculo (como o container sem HERMES_INSTALACAO_ID)
	p = payloadVetor(t)
	p["instalacao_id"] = "inst-outra"
	op := opVetor(t)
	op.instalacaoID, op.servidorID = "", ""
	if _, err := verificarDocHermes(envelopeTeste(t, p, "h1"), op); err != nil {
		t.Fatalf("sem instalação configurada não deveria conferir o vínculo: %v", err)
	}
}

func TestDecisaoHermes_RegraUnica(t *testing.T) {
	agora := tempo(t, "2026-12-01T00:00:00Z")
	futuro := agora.Add(time.Hour)
	passado := agora.Add(-time.Second)
	casos := []struct {
		nome               string
		modo               string
		panico, bloqueante bool
		offline            time.Time
		bloquear, simulado bool
	}{
		{"em dia", "valendo", false, false, futuro, false, false},
		{"bloqueante valendo", "valendo", false, true, futuro, true, false},
		{"offline vencido valendo", "valendo", false, false, passado, true, false},
		{"offline exatamente agora", "valendo", false, false, agora, true, false},
		{"bloqueante com pânico", "valendo", true, true, futuro, false, true},
		{"bloqueante em simulação", "simulacao", false, true, futuro, false, true},
		{"vencido em simulação", "simulacao", false, false, passado, false, true},
		{"em dia em simulação", "simulacao", false, false, futuro, false, false},
	}
	for _, c := range casos {
		d := &DocHermes{Modo: c.modo, Panico: c.panico, Bloqueante: c.bloqueante, offline: c.offline}
		b, s := decisaoHermes(d, agora)
		if b != c.bloquear || s != c.simulado {
			t.Errorf("%s: bloquear=%v simulado=%v, esperado %v %v", c.nome, b, s, c.bloquear, c.simulado)
		}
	}
}
