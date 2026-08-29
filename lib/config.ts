import "server-only";
import { eq } from "drizzle-orm";
import { db, configuracoes } from "@/lib/db";
import { parsePricingEn, type PricingEn } from "@/lib/dominio/preco-site";

export type ConfigPlataforma = {
  modoPanico: boolean;
  modoSimulacao: boolean;
  maxDiasConfianca: number;
};

const PADRAO: ConfigPlataforma = {
  modoPanico: false,
  // Simulação nasce LIGADA: nenhum bloqueio real até desligar conscientemente
  modoSimulacao: true,
  maxDiasConfianca: 7,
};

export async function getConfig(): Promise<ConfigPlataforma> {
  const linhas = await db.select().from(configuracoes);
  const mapa = new Map(linhas.map((l) => [l.chave, l.valor]));

  return {
    modoPanico: Boolean((mapa.get("modo_panico") as { ativo?: boolean })?.ativo ?? PADRAO.modoPanico),
    modoSimulacao: Boolean(
      (mapa.get("modo_simulacao") as { ativo?: boolean })?.ativo ?? PADRAO.modoSimulacao
    ),
    maxDiasConfianca: Number(
      (mapa.get("max_dias_confianca") as { dias?: number })?.dias ?? PADRAO.maxDiasConfianca
    ),
  };
}

export async function setConfig(chave: string, valor: Record<string, unknown>): Promise<void> {
  await db
    .insert(configuracoes)
    .values({ chave, valor, atualizadoEm: new Date() })
    .onConflictDoUpdate({
      target: configuracoes.chave,
      set: { valor, atualizadoEm: new Date() },
    });
}

export const configuracaoExiste = async (chave: string) =>
  (await db.select().from(configuracoes).where(eq(configuracoes.chave, chave))).length > 0;

/** Pricing da /en; JSON inválido ou ausente cai no padrão do domínio. */
export async function getPricingEn(): Promise<PricingEn> {
  const [linha] = await db
    .select()
    .from(configuracoes)
    .where(eq(configuracoes.chave, "pricing_en"));
  return parsePricingEn(linha?.valor);
}
