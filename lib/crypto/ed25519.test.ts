import { describe, it, expect } from "vitest";
import { gerarParEd25519, assinar, verificar } from "./ed25519";

describe("ed25519 (bytes crus base64, compatível com Go)", () => {
  it("gera par com chaves de 32 bytes (base64)", () => {
    const par = gerarParEd25519();
    expect(Buffer.from(par.publicaB64, "base64")).toHaveLength(32);
    expect(Buffer.from(par.privadaB64, "base64")).toHaveLength(32);
  });

  it("assina e verifica ida e volta", () => {
    const { publicaB64, privadaB64 } = gerarParEd25519();
    const msg = "heartbeat|2026-08-17T03:00:00Z|abc123";
    const sig = assinar(msg, privadaB64);
    expect(Buffer.from(sig, "base64")).toHaveLength(64);
    expect(verificar(msg, sig, publicaB64)).toBe(true);
  });

  it("rejeita assinatura de mensagem adulterada", () => {
    const { publicaB64, privadaB64 } = gerarParEd25519();
    const sig = assinar("mensagem original", privadaB64);
    expect(verificar("mensagem adulterada", sig, publicaB64)).toBe(false);
  });

  it("rejeita assinatura de outra chave", () => {
    const a = gerarParEd25519();
    const b = gerarParEd25519();
    const sig = assinar("dados", a.privadaB64);
    expect(verificar("dados", sig, b.publicaB64)).toBe(false);
  });

  it("verificar não lança com entrada inválida (retorna false)", () => {
    const { publicaB64 } = gerarParEd25519();
    expect(verificar("x", "nao-e-base64-valido!!", publicaB64)).toBe(false);
    expect(verificar("x", "", publicaB64)).toBe(false);
  });

  it("aceita Buffer como mensagem", () => {
    const { publicaB64, privadaB64 } = gerarParEd25519();
    const buf = Buffer.from([1, 2, 3, 4, 5]);
    const sig = assinar(buf, privadaB64);
    expect(verificar(buf, sig, publicaB64)).toBe(true);
  });
});
