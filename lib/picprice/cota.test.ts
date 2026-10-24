import { describe, expect, it } from "vitest";

import { aplicarConsumo, diaSaoPaulo, proximaMeiaNoiteSaoPaulo, usadoHoje } from "./cota";
import { tratarGeohash, tratarRanking, tratarStatus, type DepsPicPrice } from "./api";

/** Deps em memória com a MESMA regra do UPDATE atômico do banco. */
function depsComCota(limite: number) {
  const estado = { dia: null as string | null, qtde: 0, limite };
  const deps: DepsPicPrice = {
    validarToken: async (t) => (t === "bom" ? { ok: true, clienteId: "c", tokenId: "t" } : { ok: false, motivo: "inexistente" }),
    statusServico: async () => ({ estado: "operante" }),
    cacheGet: async () => ({ total: 1, produtos: [] }),
    cacheSet: async () => undefined,
    consumirCota: async (_id, dia) => {
      const r = aplicarConsumo(estado, dia);
      estado.dia = r.dia;
      estado.qtde = r.qtde;
      return { ok: r.ok, usado: r.qtde, limite: estado.limite };
    },
    lerCota: async (_id, dia) => ({ usado: usadoHoje(estado.dia, estado.qtde, dia), limite: estado.limite }),
  };
  return { deps, estado };
}

const params = () => new URLSearchParams({ gtin: "7894900011517", lojas: "001:6gkzq99z5" });

describe("dia e meia-noite de São Paulo", () => {
  it("usa o dia de São Paulo, não o UTC", () => {
    // 02:30 UTC de 25/10 = 23:30 de 24/10 em São Paulo
    expect(diaSaoPaulo(new Date("2026-10-25T02:30:00Z"))).toBe("2026-10-24");
    expect(diaSaoPaulo(new Date("2026-10-25T03:00:00Z"))).toBe("2026-10-25");
  });
  it("zera na próxima meia-noite de lá", () => {
    expect(proximaMeiaNoiteSaoPaulo(new Date("2026-10-25T02:30:00Z"))).toBe("2026-10-25T00:00:00-03:00");
    expect(proximaMeiaNoiteSaoPaulo(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01T00:00:00-03:00");
  });
});

describe("contador diário", () => {
  it("soma até o limite e para", () => {
    let e = { dia: null as string | null, qtde: 0, limite: 2 };
    const a = aplicarConsumo(e, "2026-10-24");
    e = { ...e, ...a };
    const b = aplicarConsumo(e, "2026-10-24");
    e = { ...e, ...b };
    const c = aplicarConsumo(e, "2026-10-24");
    expect([a.ok, b.ok, c.ok]).toEqual([true, true, false]);
    expect(c.qtde).toBe(2);
  });
  it("vira o dia e recomeça em 1", () => {
    const r = aplicarConsumo({ dia: "2026-10-24", qtde: 200, limite: 200 }, "2026-10-25");
    expect(r).toEqual({ ok: true, dia: "2026-10-25", qtde: 1 });
  });
});

describe("API com cota diária", () => {
  it("responde 429 LIMITE_DIARIO ao estourar, com usado, limite e zeraEm", async () => {
    const { deps } = depsComCota(2);
    const r1 = await tratarRanking("Bearer bom", params(), deps);
    const r2 = await tratarGeohash("Bearer bom", { endereco: "" }, deps); // conta mesmo sendo inválida
    const r3 = await tratarRanking("Bearer bom", params(), deps);
    expect(r1.status).toBe(200);
    expect((r1.corpo.uso as { usado: number }).usado).toBe(1);
    expect(r2.status).toBe(400);
    expect(r3.status).toBe(429);
    expect(r3.corpo.estado).toBe("LIMITE_DIARIO");
    expect(r3.corpo.mensagem).toBe("Limite diário de consultas atingido");
    expect(r3.corpo.usado).toBe(2);
    expect(r3.corpo.limite).toBe(2);
    expect(String(r3.corpo.zeraEm)).toMatch(/T00:00:00-03:00$/);
  });

  it("token inválido não conta", async () => {
    const { deps, estado } = depsComCota(5);
    const r = await tratarRanking("Bearer ruim", params(), deps);
    expect(r.corpo.estado).toBe("TOKEN_INVALIDO");
    expect(estado.qtde).toBe(0);
  });

  it("/status mostra o uso e não conta", async () => {
    const { deps, estado } = depsComCota(3);
    await tratarRanking("Bearer bom", params(), deps);
    const s1 = await tratarStatus("Bearer bom", deps);
    const s2 = await tratarStatus("Bearer bom", deps);
    expect(s1.corpo.estado).toBe("OK");
    expect((s2.corpo.uso as { usado: number; limite: number })).toMatchObject({ usado: 1, limite: 3 });
    expect(estado.qtde).toBe(1);
  });

  it("/status avisa LIMITE_DIARIO quando já estourou", async () => {
    const { deps } = depsComCota(1);
    await tratarRanking("Bearer bom", params(), deps);
    const s = await tratarStatus("Bearer bom", deps);
    expect(s.corpo.estado).toBe("LIMITE_DIARIO");
  });
});
