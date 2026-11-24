package main

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
	"unicode"
)

// Documento de licença do Hermes (modo Hermes, P4). Contrato FECHADO com o RVLand
// (lib/crypto/hermes.ts) e com o verificador do container (Hermes: licenca/nucleo.mjs):
//
//	{ "payload": "<base64 canônico do JSON>", "assinatura": "<base64, 64 bytes>", "kid": "h1" }
//
// A assinatura Ed25519 cobre os BYTES do JSON decodificado (não a string base64). Esta é uma
// cópia FIEL de `verificarDocumento` do núcleo (mesmas recusas, na mesma ordem) para o agente
// nunca gravar um documento que o container recusaria; o agente só é MAIS estrito em dois
// pontos: exige servidor_id igual ao seu (quando configurado) e só aceita datas RFC 3339
// (ou YYYY-MM-DD), que é o que o RVLand emite.

const (
	tipoDocHermes          = "hermes_licenca"
	versaoDocHermes        = 1
	toleranciaFuturoHermes = 10 * time.Minute
	tamanhoMaximoDocHermes = 64 * 1024
)

// hermesPK é a chave pública Ed25519 (base64, 32 bytes crus ou SPKI DER) do kid "h1",
// embutida no build via -ldflags "-X main.hermesPK=...". Vazia (padrão) = nenhum
// documento verifica: o agente nunca grava licenca.json nem marcadores.
var hermesPK string

func chavesHermes() map[string]string { return map[string]string{"h1": hermesPK} }

// prefixo DER de uma chave pública Ed25519 em SPKI (RFC 8410)
var spkiEd25519 = []byte{0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00}

type opcoesDoc struct {
	chaves       map[string]string
	agora        time.Time
	instalacaoID string // vazio = não confere (como o container sem HERMES_INSTALACAO_ID)
	servidorID   string // vazio = não confere
}

// DocHermes: campos do payload que o agente usa.
type DocHermes struct {
	InstalacaoID string
	EmitidoEm    string
	OfflineAte   string
	Status       string
	Modo         string
	Canal        string
	Obrigatoria  bool
	Panico       bool
	Bloqueante   bool

	emitido time.Time
	offline time.Time
}

func importarChaveHermes(v string) (ed25519.PublicKey, error) {
	b, err := base64.StdEncoding.DecodeString(trimJS(v))
	if err != nil || len(b) == 0 {
		return nil, errors.New("chave inválida")
	}
	if len(b) == ed25519.PublicKeySize {
		return ed25519.PublicKey(b), nil
	}
	if len(b) == len(spkiEd25519)+ed25519.PublicKeySize && bytes.Equal(b[:len(spkiEd25519)], spkiEd25519) {
		return ed25519.PublicKey(b[len(spkiEd25519):]), nil
	}
	return nil, errors.New("a chave não é Ed25519")
}

// dataHermes: RFC 3339 (com ou sem fração) ou só a data (YYYY-MM-DD, UTC, como o Date.parse).
func dataHermes(v any) (time.Time, bool) {
	s, ok := v.(string)
	if !ok || s == "" {
		return time.Time{}, false
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t, true
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t, true
	}
	return time.Time{}, false
}

type envelopeHermes struct{ Payload, Assinatura, Kid *string }

// lerEnvelopeHermes: chaves EXATAS (o encoding/json casaria "PAYLOAD" com payload; o núcleo do
// Hermes não). Duplicada ou desconhecida é recusada (o agente é mais estrito que o núcleo, que
// ignora chaves extras: o RV emite exatamente as três).
func lerEnvelopeHermes(texto []byte) (*envelopeHermes, error) {
	invalido := errors.New("documento não é um JSON válido")
	dec := json.NewDecoder(bytes.NewReader(texto))
	if tk, err := dec.Token(); err != nil || tk != json.Delim('{') {
		return nil, invalido
	}
	env := &envelopeHermes{}
	vistos := map[string]bool{}
	for dec.More() {
		tk, err := dec.Token()
		if err != nil {
			return nil, invalido
		}
		k, _ := tk.(string)
		if vistos[k] {
			return nil, errors.New("documento com chave duplicada")
		}
		vistos[k] = true
		var v *string
		switch k {
		case "payload":
			env.Payload = new(string)
			v = env.Payload
		case "assinatura":
			env.Assinatura = new(string)
			v = env.Assinatura
		case "kid":
			env.Kid = new(string)
			v = env.Kid
		default:
			return nil, fmt.Errorf("documento com chave desconhecida (%.32q)", k)
		}
		var raw json.RawMessage
		if err := dec.Decode(&raw); err != nil || json.Unmarshal(raw, v) != nil || bytes.Equal(raw, []byte("null")) {
			return nil, errors.New("documento incompleto (faltam payload, assinatura ou kid)")
		}
	}
	if tk, err := dec.Token(); err != nil || tk != json.Delim('}') {
		return nil, invalido
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, invalido
	}
	if env.Payload == nil || env.Assinatura == nil || env.Kid == nil {
		return nil, errors.New("documento incompleto (faltam payload, assinatura ou kid)")
	}
	return env, nil
}

// trimJS replica String.prototype.trim do JavaScript (o núcleo do Hermes usa `.trim()`):
// WhiteSpace (TAB, VT, FF, SP, NBSP, ZWNBSP/BOM e a categoria Zs) + LineTerminator (LF, CR,
// LS, PS). Difere de strings.TrimSpace: tira U+FEFF e NÃO tira U+0085 (NEL).
func trimJS(s string) string {
	return strings.TrimFunc(s, func(r rune) bool {
		switch r {
		case '\t', '\n', '\v', '\f', '\r', ' ', '\u00a0', '\ufeff', '\u2028', '\u2029':
			return true
		}
		return unicode.Is(unicode.Zs, r)
	})
}

// fpChaveHermes: fingerprint da chave pública h1 = sha256 hex minúsculo dos 32 bytes CRUS da
// chave Ed25519 (a forma SPKI dá o mesmo valor). Chave inválida/placeholder = "".
// É o valor esperado no label org.aramo.hermes.licenca-chave-fp da imagem do Hermes.
func fpChaveHermes(pk string) string {
	pub, err := importarChaveHermes(pk)
	if err != nil {
		return ""
	}
	return sha256Hex(pub)
}

// verificarDocHermes confere se o documento é autêntico e deste servidor/instalação.
// NÃO decide bloqueio (isso é decisaoHermes).
func verificarDocHermes(texto []byte, op opcoesDoc) (*DocHermes, error) {
	if len(texto) > tamanhoMaximoDocHermes {
		return nil, errors.New("documento grande demais")
	}
	env, err := lerEnvelopeHermes(texto)
	if err != nil {
		return nil, err
	}
	chave, conhecida := op.chaves[*env.Kid]
	if !conhecida {
		return nil, fmt.Errorf("kid desconhecido (%.32q)", *env.Kid)
	}
	pub, err := importarChaveHermes(chave)
	if err != nil {
		return nil, fmt.Errorf("a chave pública %q do agente é inválida ou placeholder", *env.Kid)
	}

	// base64 canônico e não vazio, assinatura sobre os BYTES, antes de parsear
	bts, err := base64.StdEncoding.DecodeString(*env.Payload)
	if err != nil || len(bts) == 0 || base64.StdEncoding.EncodeToString(bts) != *env.Payload {
		return nil, errors.New("payload não é base64 canônico ou está vazio")
	}
	sig, err := base64.StdEncoding.DecodeString(*env.Assinatura)
	if err != nil || len(sig) != ed25519.SignatureSize || !ed25519.Verify(pub, bts, sig) {
		return nil, errors.New("assinatura inválida")
	}

	var p map[string]any
	if err := json.Unmarshal(bts, &p); err != nil || p == nil {
		return nil, errors.New("payload não é um objeto JSON")
	}
	if p["tipo"] != tipoDocHermes {
		return nil, errors.New("tipo desconhecido")
	}
	if v, ok := p["v"].(float64); !ok || v != versaoDocHermes {
		return nil, errors.New("versão de documento não suportada")
	}
	if k, ok := p["kid"].(string); !ok || k != *env.Kid {
		return nil, errors.New("kid do payload diverge do kid do documento")
	}
	emitido, ok := dataHermes(p["emitido_em"])
	if !ok {
		return nil, errors.New("emitido_em ausente ou inválido")
	}
	offline, ok := dataHermes(p["offline_ate"])
	if !ok {
		return nil, errors.New("offline_ate ausente ou inválido")
	}
	d := &DocHermes{emitido: emitido, offline: offline}
	d.EmitidoEm, _ = p["emitido_em"].(string)
	d.OfflineAte, _ = p["offline_ate"].(string)
	d.InstalacaoID, _ = p["instalacao_id"].(string)
	d.Canal, _ = p["canal"].(string)
	if d.Status, _ = p["status"].(string); d.Status == "" {
		return nil, errors.New("status ausente")
	}
	if d.Modo, _ = p["modo"].(string); d.Modo != "simulacao" && d.Modo != "valendo" {
		return nil, errors.New("modo desconhecido")
	}
	var b1, b2, b3 bool
	if d.Bloqueante, b1 = p["bloqueante"].(bool); !b1 {
		return nil, errors.New("bloqueante deve ser booleano")
	}
	if d.Panico, b2 = p["panico"].(bool); !b2 {
		return nil, errors.New("panico deve ser booleano")
	}
	if d.Obrigatoria, b3 = p["obrigatoria"].(bool); !b3 {
		return nil, errors.New("obrigatoria deve ser booleano")
	}
	if emitido.After(op.agora.Add(toleranciaFuturoHermes)) {
		return nil, errors.New("documento emitido no futuro (confira o relógio)")
	}
	if id := trimJS(op.instalacaoID); id != "" {
		if v, ok := p["instalacao_id"].(string); !ok || v != id {
			return nil, errors.New("documento de outra instalação")
		}
	}
	if op.servidorID != "" {
		if v, ok := p["servidor_id"].(string); !ok || v != op.servidorID {
			return nil, errors.New("documento de outro servidor")
		}
	}
	return d, nil
}

// decisaoHermes: a REGRA ÚNICA (lib/hermes/documento.ts e licenca/nucleo.mjs).
// violou = bloqueante || agora >= offline_ate. bloquear = violou && valendo && !panico.
// simulado = violou mas não bloqueia (simulação ou pânico): só registra.
func decisaoHermes(d *DocHermes, agora time.Time) (bloquear, simulado bool) {
	violou := d.Bloqueante || !agora.Before(d.offline)
	bloquear = violou && d.Modo == "valendo" && !d.Panico
	return bloquear, violou && !bloquear
}
