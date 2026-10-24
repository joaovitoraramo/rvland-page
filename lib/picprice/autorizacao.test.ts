import { describe, expect, it } from "vitest";

import { lerPedido, tratarAutorizacao, VALIDADE_AUTORIZACAO_S, type PayloadAutorizacao } from "./autorizacao";
import type { DepsPicPrice } from "./api";

const servidor = { id: "srv-1", clienteId: "cli-1", moduloPicprice: true };
const corpoOk = { gtin: "7891010793463", lojas: ["6gkzq99z5j5f", "6gkzmg4bx"], raio: 3, data: -1 };

function deps(extra: Partial<DepsPicPrice> = {}) {
  let cota = 0;
  const assinados: PayloadAutorizacao[] = [];
  const d = {
    validarToken: async (t: string) =>
      t === "bom" ? ({ ok: true, clienteId: "cli-1", tokenId: "tk1" } as const)
      : t === "outro" ? ({ ok: true, clienteId: "cli-2", tokenId: "tk2" } as const)
      : ({ ok: false, motivo: "inexistente" } as const),
    statusServico: async () => ({ estado: "operante" as const }),
    cacheGet: async () => null,
    cacheSet: async () => undefined,
    consumirCota: async () => ({ ok: ++cota <= 2, usado: Math.min(cota, 2), limite: 2 }),
    assinar: (p: PayloadAutorizacao) => (assinados.push(p), { payload: "p", assinatura: "a" }),
    ...extra,
  };
  return { d, assinados, cota: () => cota };
}

describe("autorização do agente (RV Pic Price)", () => {
  it("módulo desligado no servidor: MODULO_DESATIVADO, sem contar cota", async () => {
    const { d, cota } = deps();
    const r = await tratarAutorizacao({ ...servidor, moduloPicprice: false }, "Bearer bom", corpoOk, d);
    expect(r.status).toBe(403);
    expect(r.corpo.estado).toBe("MODULO_DESATIVADO");
    expect(cota()).toBe(0);
  });

  it("token de outro cliente é recusado antes da cota", async () => {
    const { d, cota } = deps();
    const r = await tratarAutorizacao(servidor, "Bearer outro", corpoOk, d);
    expect(r.corpo.estado).toBe("TOKEN_INVALIDO");
    expect(r.corpo.motivo).toBe("outro_cliente");
    expect(cota()).toBe(0);
  });

  it("OK: assina payload amarrado ao servidor, EAN e lojas, curto e conta 1", async () => {
    const { d, assinados, cota } = deps();
    const agora = new Date("2026-10-24T12:00:00Z");
    const r = await tratarAutorizacao(servidor, "Bearer bom", corpoOk, d, agora);
    expect(r.corpo.estado).toBe("OK");
    expect(cota()).toBe(1);
    const p = assinados[0];
    expect(p.servidor_id).toBe("srv-1");
    expect(p.cliente_id).toBe("cli-1");
    expect(p.gtin).toBe("7891010793463");
    expect(p.lojas).toEqual(["6gkzmg4bx", "6gkzq99z5j5f"]);
    expect(Date.parse(p.expira_em) - agora.getTime()).toBe(VALIDADE_AUTORIZACAO_S * 1000);
  });

  it("estoura a cota: LIMITE_DIARIO", async () => {
    const { d } = deps();
    await tratarAutorizacao(servidor, "Bearer bom", corpoOk, d);
    await tratarAutorizacao(servidor, "Bearer bom", corpoOk, d);
    const r = await tratarAutorizacao(servidor, "Bearer bom", corpoOk, d);
    expect(r.status).toBe(429);
    expect(r.corpo.estado).toBe("LIMITE_DIARIO");
  });

  it("manutenção vem antes da cota", async () => {
    const { d, cota } = deps({ statusServico: async () => ({ estado: "manutencao", mensagem: "janela", previsao: null }) });
    const r = await tratarAutorizacao(servidor, "Bearer bom", corpoOk, d);
    expect(r.corpo.estado).toBe("MANUTENCAO");
    expect(cota()).toBe(0);
  });

  it("valida o pedido", () => {
    expect(lerPedido({ ...corpoOk, gtin: "123" })).toBeNull();
    expect(lerPedido({ ...corpoOk, lojas: ["xx!"] })).toBeNull();
    expect(lerPedido({ ...corpoOk, lojas: [] })).toBeNull();
    expect(lerPedido({ ...corpoOk, raio: 99 })?.raio).toBe(20);
  });
});
