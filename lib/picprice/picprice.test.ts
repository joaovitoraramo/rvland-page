import { describe, expect, it } from "vitest";

import { geohashDecode, geohashEncode } from "./geohash";
import { ehIsca, montarTop, parseLojas, rankingDaLoja, type RespostaFonte } from "./ranking";
import { dentroDoLimite, extrairToken, tratarRanking, type DepsPicPrice } from "./api";

const REAL_COD = "x".repeat(43);
const item = (id: string, valor: number, extra: Partial<{ cod: string; desc: string; dist: number }> = {}) => ({
  id,
  valor: String(valor),
  desc: extra.desc ?? "COCA COLA 2L",
  distkm: String(extra.dist ?? 1),
  tempo: "há 2 horas",
  datahora: "2026-10-23T10:00:00",
  estabelecimento: { codigo: extra.cod ?? REAL_COD, nm_fan: "CONCORRENTE", nm_emp: "CONCORRENTE LTDA" },
});

describe("geohash", () => {
  it("bate com o padrão clássico e volta perto do ponto", () => {
    const h = geohashEncode(-25.4381561, -49.2790737, 12);
    expect(h.startsWith("6gkzq9")).toBe(true);
    const { lat, lon } = geohashDecode(h);
    expect(Math.abs(lat + 25.4381561)).toBeLessThan(1e-5);
    expect(Math.abs(lon + 49.2790737)).toBeLessThan(1e-5);
  });
});

describe("filtro de isca e ranking", () => {
  it("só descarta com as duas marcas da isca", () => {
    expect(ehIsca({ id: "abc.123", valor: 1, estabelecimento: { codigo: "y".repeat(88) } })).toBe(true);
    expect(ehIsca({ id: "abc.123", valor: 1, estabelecimento: { codigo: REAL_COD } })).toBe(false);
    expect(ehIsca({ id: "Ab_c-1", valor: 1, estabelecimento: { codigo: "y".repeat(88) } })).toBe(false);
  });

  it("dedup por loja+descrição+preço, ordena por preço e esconde o concorrente", () => {
    const res: RespostaFonte = {
      total: 5,
      produtos: [item("B_1", 9.9), item("A_1", 8.5), item("A_2", 8.5), item("isca.1", 1, { cod: "z".repeat(88) }), item("C_1", 8.5, { cod: "w".repeat(43), dist: 0.5 })],
    };
    const top = montarTop(res);
    expect(top.map((p) => p.valor)).toEqual([8.5, 8.5, 9.9]);
    expect(top[0].distanciaKm).toBe(0.5);
    expect(JSON.stringify(top)).not.toContain("CONCORRENTE");
    expect(top[0].posicao).toBe(1);
  });

  it("pede página cheia quando sobram menos de 10", async () => {
    const urls: string[] = [];
    const buscar = async (u: string) => {
      urls.push(u);
      return { total: 30, produtos: [item("A_1", 5)] };
    };
    const r = await rankingDaLoja(buscar, { loja: "001", geohash: "6gkzq99z5", gtin: "7894900011517", raio: 3, data: -1 });
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("size=50");
    expect(urls[0]).toContain("raio=3");
    expect(r.totalNaArea).toBe(30);
  });

  it("lê lojas codigo:geohash e ignora geohash inválido", () => {
    expect(parseLojas("001:6gkzq99z5,002:ABC,003:6gkzmg4bx")).toEqual([
      { loja: "001", geohash: "6gkzq99z5" },
      { loja: "003", geohash: "6gkzmg4bx" },
    ]);
  });
});

describe("porteiro e estados", () => {
  const base = (over: Partial<DepsPicPrice> = {}): DepsPicPrice => ({
    validarToken: async () => ({ ok: true, clienteId: "c", tokenId: "t-" + Math.random() }),
    statusServico: async () => ({ estado: "operante" }),
    cacheGet: async () => null,
    cacheSet: async () => undefined,
    buscar: async () => ({ total: 1, produtos: [item("A_1", 4.99)] }),
    ...over,
  });
  const q = new URLSearchParams({ gtin: "7894900011517", lojas: "001:6gkzq99z5", raio: "3" });

  it("Bearer", () => {
    expect(extrairToken("Bearer rvpp_abc")).toBe("rvpp_abc");
    expect(extrairToken("Basic x")).toBeNull();
  });

  it("token revogado -> TOKEN_INVALIDO com o texto do serviço", async () => {
    const r = await tratarRanking("Bearer x", q, base({ validarToken: async () => ({ ok: false, motivo: "revogado" }) }));
    expect(r.status).toBe(401);
    expect(r.corpo).toMatchObject({ estado: "TOKEN_INVALIDO", mensagem: "Serviço inválido - token revogado" });
  });

  it("manutenção -> MANUTENCAO com mensagem e previsão", async () => {
    const r = await tratarRanking("Bearer x", q, base({ statusServico: async () => ({ estado: "manutencao", mensagem: "Atualizando", previsao: "18h" }) }));
    expect(r.corpo).toMatchObject({ estado: "MANUTENCAO", mensagem: "Atualizando", previsao: "18h" });
  });

  it("fonte fora -> FONTE_INDISPONIVEL", async () => {
    const r = await tratarRanking("Bearer x", q, base({ buscar: async () => { throw new Error("503"); } }));
    expect(r.status).toBe(503);
    expect(r.corpo.estado).toBe("FONTE_INDISPONIVEL");
  });

  it("OK devolve raio usado e ranking por loja", async () => {
    const r = await tratarRanking("Bearer x", q, base());
    expect(r.corpo).toMatchObject({ estado: "OK", raio: 3, gtin: "7894900011517" });
    expect((r.corpo.lojas as unknown[]).length).toBe(1);
  });

  it("rate limit por token", () => {
    const t = "limite-" + Math.random();
    let ok = 0;
    for (let i = 0; i < 130; i++) if (dentroDoLimite(t, 1_000)) ok++;
    expect(ok).toBe(120);
  });
});
