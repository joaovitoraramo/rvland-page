import { z } from "zod";

/**
 * Pricing da /en, guardado em `configuracoes` sob a chave `pricing_en`.
 * Qualquer JSON inválido cai no padrão — a página nunca quebra por config.
 */
export const esquemaPricingEn = z.object({
  moeda: z.literal("USD"),
  planos: z.object({
    full: z.object({ ativo: z.boolean(), valorCentavos: z.number().int().positive() }),
    m6: z.object({
      ativo: z.boolean(),
      valorCentavos: z.number().int().positive(),
      parcelas: z.literal(6),
    }),
    m12: z.object({
      ativo: z.boolean(),
      valorCentavos: z.number().int().positive(),
      parcelas: z.literal(12),
    }),
  }),
  care: z.object({
    valorCentavos: z.number().int().positive(),
    mesesInclusos: z.number().int().min(1).max(36),
  }),
});

export type PricingEn = z.infer<typeof esquemaPricingEn>;

export const PRICING_EN_PADRAO: PricingEn = {
  moeda: "USD",
  planos: {
    full: { ativo: true, valorCentavos: 149700 },
    m6: { ativo: true, valorCentavos: 29900, parcelas: 6 },
    m12: { ativo: true, valorCentavos: 17900, parcelas: 12 },
  },
  care: { valorCentavos: 7900, mesesInclusos: 12 },
};

export function parsePricingEn(valor: unknown): PricingEn {
  const r = esquemaPricingEn.safeParse(valor);
  return r.success ? r.data : PRICING_EN_PADRAO;
}

export function totalPlano(valorCentavos: number, parcelas: number): number {
  return valorCentavos * parcelas;
}

/**
 * Quanto do plano mensal é servidor. É barato e a gente diz o número: mostrar
 * que quase tudo vai para suporte humano explica o preço melhor do que
 * qualquer adjetivo.
 */
export const HOSTING_MENSAL_CENTAVOS = 700;

/** Divide o care entre hospedagem e suporte. Null quando a conta não fecha. */
export function divisaoCare(
  careCentavos: number
): { hostingCentavos: number; suporteCentavos: number } | null {
  const suporteCentavos = careCentavos - HOSTING_MENSAL_CENTAVOS;
  // sem folga a divisão vira ruído: melhor não mostrar do que mostrar torto
  if (suporteCentavos < HOSTING_MENSAL_CENTAVOS) return null;
  return { hostingCentavos: HOSTING_MENSAL_CENTAVOS, suporteCentavos };
}
