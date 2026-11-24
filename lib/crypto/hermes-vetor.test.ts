import { describe, it, expect } from "vitest";
import { assinarDocumentoHermes, verificarDocumentoHermes, type EnvelopeHermes } from "./hermes";
import type { DocumentoHermes } from "@/lib/hermes/documento";

/**
 * VETOR FIXO cruzado com o Hermes (src/lib/fixtures/vetor-rvland.json no repo Hermes).
 * A seed abaixo e CHAVE DE TESTE publica (nunca a chave de producao). Ed25519 e deterministico:
 * assinar o mesmo documento com a mesma seed SEMPRE gera o mesmo envelope. Se este teste quebrar,
 * o contrato de assinatura mudou (JSON.stringify do documento, base64 canonico, assinatura sobre
 * os BYTES do JSON, nao sobre a string base64) e o verificador do Hermes (licenca/nucleo.mjs)
 * precisa ser atualizado junto: regenere o vetor e a fixture do Hermes.
 */
const SEED_TESTE_B64 = "N8/J3suRQZe3wLpwNhOiR8eO2xtU8S3500WYra+nbaA=";
const CHAVE_PUBLICA_TESTE_B64 = "MYUyj+tMTtw8XTHK46wM4NoafLV7XKL7fH/uCgUZxqc=";

const DOC: DocumentoHermes = {
  tipo: "hermes_licenca",
  v: 1,
  kid: "h1",
  instalacao_id: "inst-vetor-1",
  servidor_id: "srv-vetor-1",
  cliente_id: "cli-vetor-1",
  cnpj: "12345678000190",
  emitido_em: "2026-11-20T12:00:00.000Z",
  status: "ativa",
  origem: "contrato",
  expira_em: "2026-12-20",
  carencia_ate: "2026-12-23",
  operar_ate: "2026-12-24T06:00:00.000Z",
  offline_ate: "2026-12-27T06:00:00.000Z",
  modo: "valendo",
  obrigatoria: true,
  canal: "stable",
  aviso: null,
  panico: false,
  bloqueante: false,
};

const ENVELOPE_ESPERADO: EnvelopeHermes = {
  payload:
    "eyJ0aXBvIjoiaGVybWVzX2xpY2VuY2EiLCJ2IjoxLCJraWQiOiJoMSIsImluc3RhbGFjYW9faWQiOiJpbnN0LXZldG9yLTEiLCJzZXJ2aWRvcl9pZCI6InNydi12ZXRvci0xIiwiY2xpZW50ZV9pZCI6ImNsaS12ZXRvci0xIiwiY25waiI6IjEyMzQ1Njc4MDAwMTkwIiwiZW1pdGlkb19lbSI6IjIwMjYtMTEtMjBUMTI6MDA6MDAuMDAwWiIsInN0YXR1cyI6ImF0aXZhIiwib3JpZ2VtIjoiY29udHJhdG8iLCJleHBpcmFfZW0iOiIyMDI2LTEyLTIwIiwiY2FyZW5jaWFfYXRlIjoiMjAyNi0xMi0yMyIsIm9wZXJhcl9hdGUiOiIyMDI2LTEyLTI0VDA2OjAwOjAwLjAwMFoiLCJvZmZsaW5lX2F0ZSI6IjIwMjYtMTItMjdUMDY6MDA6MDAuMDAwWiIsIm1vZG8iOiJ2YWxlbmRvIiwib2JyaWdhdG9yaWEiOnRydWUsImNhbmFsIjoic3RhYmxlIiwiYXZpc28iOm51bGwsInBhbmljbyI6ZmFsc2UsImJsb3F1ZWFudGUiOmZhbHNlfQ==",
  assinatura:
    "m16f1O3uMLZSNgTFRjW3+uET97u3MFpMGgigW15NES7u6poxa1hCf2QjMig7DOWwAc5WaUbjVRIXoEYNbtCzBw==",
  kid: "h1",
};

describe("vetor fixo Hermes (cruzado com o verificador do repo Hermes)", () => {
  it("assinarDocumentoHermes reproduz byte a byte o envelope do vetor", () => {
    expect(assinarDocumentoHermes(DOC, SEED_TESTE_B64)).toEqual(ENVELOPE_ESPERADO);
  });

  it("o envelope do vetor verifica com a chave publica de teste e devolve o documento", () => {
    expect(verificarDocumentoHermes(ENVELOPE_ESPERADO, { h1: CHAVE_PUBLICA_TESTE_B64 })).toEqual(DOC);
  });

  it("a assinatura cobre os BYTES do JSON decodificado, nao a string base64; base64 e canonico", () => {
    const bytes = Buffer.from(ENVELOPE_ESPERADO.payload, "base64");
    expect(bytes.toString("base64")).toBe(ENVELOPE_ESPERADO.payload);
    expect(JSON.parse(bytes.toString("utf8"))).toEqual(DOC);
    expect(bytes.toString("utf8")).toBe(JSON.stringify(DOC));
  });

  it("qualquer byte alterado no payload ou na assinatura invalida o vetor", () => {
    const troca = (b64: string, i: number) => {
      const b = Buffer.from(b64, "base64");
      b[i] ^= 0x01;
      return b.toString("base64");
    };
    const chaves = { h1: CHAVE_PUBLICA_TESTE_B64 };
    expect(verificarDocumentoHermes({ ...ENVELOPE_ESPERADO, payload: troca(ENVELOPE_ESPERADO.payload, 5) }, chaves)).toBeNull();
    expect(verificarDocumentoHermes({ ...ENVELOPE_ESPERADO, assinatura: troca(ENVELOPE_ESPERADO.assinatura, 7) }, chaves)).toBeNull();
  });
});
