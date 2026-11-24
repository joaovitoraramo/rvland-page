import { describe, it, expect } from "vitest";
import { lerCorpoLimitado, ipDoRequest, chaveDeIp, LIMITE_CORPO_PUBLICO } from "./hermes-http";

function req(body: string, headers: Record<string, string> = {}) {
  return new Request("http://x/api", { method: "POST", body, headers });
}

describe("hermes-http", () => {
  it("limite público é 16 KB", () => {
    expect(LIMITE_CORPO_PUBLICO).toBe(16 * 1024);
  });

  it("lê corpo dentro do limite", async () => {
    const r = await lerCorpoLimitado(req('{"a":1}'), LIMITE_CORPO_PUBLICO);
    expect(r).toEqual({ ok: true, texto: '{"a":1}' });
  });

  it("recusa corpo acima do limite (stream, mesmo sem content-length)", async () => {
    const grande = "x".repeat(LIMITE_CORPO_PUBLICO + 1);
    const r = await lerCorpoLimitado(req(grande), LIMITE_CORPO_PUBLICO);
    expect(r.ok).toBe(false);
  });

  it("recusa já pelo content-length declarado", async () => {
    const r = await lerCorpoLimitado(req("{}", { "content-length": "99999" }), LIMITE_CORPO_PUBLICO);
    expect(r.ok).toBe(false);
  });

  it("IP: primeiro do x-forwarded-for, senão x-real-ip, senão desconhecido", () => {
    expect(ipDoRequest(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(ipDoRequest(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(ipDoRequest(new Headers())).toBe("desconhecido");
  });

  it("IPv6 é agrupado por /64 (o atacante tem o prefixo inteiro); IPv4 e v4-mapeado seguem por endereço", () => {
    const k = (ip: string) => chaveDeIp("sol", ip);
    // mesmo /64, hosts diferentes → mesma chave
    expect(k("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(k("2001:db8:1:2::1"));
    expect(k("2001:0db8:0001:0002:0000:0000:0000:0001")).toBe(k("2001:db8:1:2:ffff::9"));
    expect(k("2001:DB8:1:2::1")).toBe(k("2001:db8:1:2::2"));
    // /64 diferente → chave diferente
    expect(k("2001:db8:1:3::1")).not.toBe(k("2001:db8:1:2::1"));
    // compressão no prefixo
    expect(k("2001:db8::1")).toBe(k("2001:db8:0:0:5::7"));
    expect(k("::1")).toBe(k("0:0:0:0:9::1"));
    // v4-mapeado = o IPv4
    expect(k("::ffff:1.2.3.4")).toBe(k("1.2.3.4"));
    // IPv4 continua por endereço
    expect(k("1.2.3.4")).not.toBe(k("1.2.3.5"));
    // sem IP cru na chave
    expect(k("2001:db8:1:2::1")).not.toContain("2001");
    // lixo não quebra
    expect(k("desconhecido")).toMatch(/^sol:[0-9a-f]{32}$/);
  });

  it("chave de rate limit não guarda o IP cru", () => {
    const k = chaveDeIp("sol", "1.2.3.4");
    expect(k.startsWith("sol:")).toBe(true);
    expect(k).not.toContain("1.2.3.4");
    expect(chaveDeIp("sol", "1.2.3.4")).toBe(k);
    expect(chaveDeIp("sol", "1.2.3.5")).not.toBe(k);
  });
});

import { lerEntradaAgente, lerCorpoPublico, LIMITE_CORPO_AGENTE } from "./hermes-http";

describe("entradas das rotas", () => {
  it("agente: lê os 3 headers e o corpo cru; acima do teto é 413", async () => {
    const r = await lerEntradaAgente(
      new Request("http://x", {
        method: "POST",
        body: '{"a":1}',
        headers: { "x-rvland-servidor": "s", "x-rvland-timestamp": "t", "x-rvland-assinatura": "a" },
      })
    );
    expect(r).toEqual({ ok: true, entrada: { servidorId: "s", timestamp: "t", assinatura: "a", rawBody: '{"a":1}' } });
    const grande = await lerEntradaAgente(new Request("http://x", { method: "POST", body: "x".repeat(LIMITE_CORPO_AGENTE + 1) }));
    expect(grande).toEqual({ ok: false, resposta: { status: 413, corpo: { erro: "CORPO_GRANDE" } } });
  });

  it("público: corpo até 16 KB; acima é 413", async () => {
    expect(await lerCorpoPublico(new Request("http://x", { method: "POST", body: "{}" }))).toEqual({ ok: true, texto: "{}" });
    const r = await lerCorpoPublico(new Request("http://x", { method: "POST", body: "x".repeat(16 * 1024 + 1) }));
    expect(r).toEqual({ ok: false, resposta: { status: 413, corpo: { erro: "CORPO_GRANDE" } } });
  });
});
