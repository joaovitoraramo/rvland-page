import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";

import { assinar, gerarParEd25519 } from "@/lib/crypto/ed25519";
import { mensagemAssinada } from "@/lib/crypto/heartbeat-auth";
import {
  assinarPedidoHermes,
  mensagemHermes,
  timestampFrescoHermes,
  verificarPedidoHermes,
} from "./assinatura-agente";

const TS = "2026-11-23T12:00:00.000Z";
const CORPO = '{"pedido":"credencial"}';
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("assinatura do agente Hermes (domínio próprio)", () => {
  it("mensagem exata: hermes:<rota>:<ts>.<sha256(body)>", () => {
    expect(mensagemHermes("sync", TS, CORPO)).toBe(`hermes:sync:${TS}.${sha(CORPO)}`);
    expect(mensagemHermes("credencial", TS, CORPO)).toBe(`hermes:credencial:${TS}.${sha(CORPO)}`);
    expect(mensagemHermes("ativacao", TS, CORPO)).toBe(`hermes:ativacao:${TS}.${sha(CORPO)}`);
  });

  it("assina e verifica na mesma rota", () => {
    const k = gerarParEd25519();
    for (const rota of ["sync", "credencial", "ativacao"] as const) {
      const a = assinarPedidoHermes(rota, TS, CORPO, k.privadaB64);
      expect(verificarPedidoHermes({ rota, pubkeyB64: k.publicaB64, timestamp: TS, rawBody: CORPO, assinaturaB64: a })).toBe(true);
    }
  });

  it("assinatura de ativacao não vale em sync/credencial e vice-versa", () => {
    const k = gerarParEd25519();
    const p = { pubkeyB64: k.publicaB64, timestamp: TS, rawBody: CORPO };
    const ativ = assinarPedidoHermes("ativacao", TS, CORPO, k.privadaB64);
    expect(verificarPedidoHermes({ ...p, rota: "sync", assinaturaB64: ativ })).toBe(false);
    expect(verificarPedidoHermes({ ...p, rota: "credencial", assinaturaB64: ativ })).toBe(false);
    expect(verificarPedidoHermes({ ...p, rota: "ativacao", assinaturaB64: assinarPedidoHermes("sync", TS, CORPO, k.privadaB64) })).toBe(false);
  });

  it("assinatura de sync NÃO vale na credencial, e vice-versa", () => {
    const k = gerarParEd25519();
    const p = { pubkeyB64: k.publicaB64, timestamp: TS, rawBody: CORPO };
    const sync = assinarPedidoHermes("sync", TS, CORPO, k.privadaB64);
    const cred = assinarPedidoHermes("credencial", TS, CORPO, k.privadaB64);
    expect(verificarPedidoHermes({ ...p, rota: "credencial", assinaturaB64: sync })).toBe(false);
    expect(verificarPedidoHermes({ ...p, rota: "sync", assinaturaB64: cred })).toBe(false);
  });

  it("assinatura do heartbeat do Credit (`ts.sha256(body)`) não vale em nenhuma rota Hermes", () => {
    const k = gerarParEd25519();
    const hb = assinar(mensagemAssinada(TS, CORPO), k.privadaB64);
    for (const rota of ["sync", "credencial", "ativacao"] as const) {
      expect(verificarPedidoHermes({ rota, pubkeyB64: k.publicaB64, timestamp: TS, rawBody: CORPO, assinaturaB64: hb })).toBe(false);
    }
  });

  it("corpo adulterado, timestamp trocado ou chave errada não validam", () => {
    const k = gerarParEd25519();
    const a = assinarPedidoHermes("sync", TS, CORPO, k.privadaB64);
    const base = { rota: "sync" as const, pubkeyB64: k.publicaB64, assinaturaB64: a };
    expect(verificarPedidoHermes({ ...base, timestamp: TS, rawBody: CORPO + " " })).toBe(false);
    expect(verificarPedidoHermes({ ...base, timestamp: "2026-11-23T12:00:01.000Z", rawBody: CORPO })).toBe(false);
    expect(verificarPedidoHermes({ ...base, pubkeyB64: gerarParEd25519().publicaB64, timestamp: TS, rawBody: CORPO })).toBe(false);
  });

  it("rota fora da lista é recusada (nunca assina nem valida)", () => {
    const k = gerarParEd25519();
    // @ts-expect-error rota inválida
    expect(() => mensagemHermes("heartbeat", TS, CORPO)).toThrow();
    const a = assinar(`hermes:heartbeat:${TS}.${sha(CORPO)}`, k.privadaB64);
    // @ts-expect-error rota inválida
    expect(verificarPedidoHermes({ rota: "heartbeat", pubkeyB64: k.publicaB64, timestamp: TS, rawBody: CORPO, assinaturaB64: a })).toBe(false);
  });

  it("janela de frescor ±5 min", () => {
    const t = Date.parse(TS);
    expect(timestampFrescoHermes(TS, t)).toBe(true);
    expect(timestampFrescoHermes(TS, t + 5 * 60_000)).toBe(true);
    expect(timestampFrescoHermes(TS, t + 5 * 60_000 + 1)).toBe(false);
    expect(timestampFrescoHermes("lixo", t)).toBe(false);
  });
});
