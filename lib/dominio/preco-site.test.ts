import { describe, expect, it } from "vitest";
import { PRICING_EN_PADRAO, parsePricingEn, totalPlano } from "@/lib/dominio/preco-site";

describe("parsePricingEn", () => {
  it("aceita JSON válido", () => {
    const p = parsePricingEn(PRICING_EN_PADRAO);
    expect(p.planos.m6.parcelas).toBe(6);
    expect(p.care.mesesInclusos).toBe(12);
  });

  it("cai no padrão quando ausente ou inválido", () => {
    expect(parsePricingEn(undefined)).toEqual(PRICING_EN_PADRAO);
    expect(parsePricingEn(null)).toEqual(PRICING_EN_PADRAO);
    expect(parsePricingEn({ moeda: "BRL" })).toEqual(PRICING_EN_PADRAO);
  });
});

describe("totalPlano", () => {
  it("multiplica parcela × meses", () => {
    expect(totalPlano(29900, 6)).toBe(179400);
    expect(totalPlano(17900, 12)).toBe(214800);
  });
});
