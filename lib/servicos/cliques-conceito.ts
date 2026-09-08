import "server-only";
import { desc, eq, sql } from "drizzle-orm";

import { cliquesConceito, db, prospeccao, visitasConceito } from "@/lib/db";
import { enviarTelegram } from "@/lib/telegram";
import {
  limparItens,
  mensagemCliques,
  type CliqueConceito,
  type ItemClique,
} from "@/lib/dominio/cliques-conceito";
import { ehRobo } from "@/lib/dominio/visitas-conceito";

export type EntradaCliques = {
  slug: string;
  visitante: string;
  sessao: string;
  itens: ItemClique[];
  userAgent: string | null;
};

/**
 * Grava um lote de cliques de uma sessão e avisa no Telegram.
 *
 * O navegador junta os cliques de alguns segundos e manda de uma vez; cada
 * lote vira uma mensagem só, com a lista na ordem em que aconteceu. Robô não
 * entra, e prospect de teste do harness não avisa.
 */
export async function registrarCliques(entrada: EntradaCliques): Promise<{
  gravados: number;
  motivo?: "robo" | "vazio";
}> {
  if (ehRobo(entrada.userAgent)) return { gravados: 0, motivo: "robo" };

  const itens = limparItens(entrada.itens);
  if (itens.length === 0) return { gravados: 0, motivo: "vazio" };

  await db.insert(cliquesConceito).values(
    itens.map((i) => ({
      slug: entrada.slug,
      visitante: entrada.visitante,
      sessao: entrada.sessao,
      rotulo: i.rotulo,
      secao: i.secao,
      destino: i.destino,
    }))
  );

  await avisar(entrada, itens);

  return { gravados: itens.length };
}

async function avisar(entrada: EntradaCliques, itens: ItemClique[]) {
  try {
    const [prospect] = await db
      .select({ negocio: prospeccao.negocio, teste: prospeccao.teste })
      .from(prospeccao)
      .where(sql`${prospeccao.conceito}->>'url' like ${`%/c/${entrada.slug}`}`)
      .limit(1);

    // o harness grava cliques de mentira: eles não podem virar alerta
    if (prospect?.teste) return;

    const [visita] = await db
      .select({
        dispositivo: visitasConceito.dispositivo,
        sistema: visitasConceito.sistema,
        cidade: visitasConceito.cidade,
        pais: visitasConceito.pais,
      })
      .from(visitasConceito)
      .where(eq(visitasConceito.sessao, entrada.sessao))
      .limit(1);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(cliquesConceito)
      .where(eq(cliquesConceito.sessao, entrada.sessao));

    await enviarTelegram(
      mensagemCliques({
        negocio: prospect?.negocio ?? entrada.slug,
        slug: entrada.slug,
        itens,
        visita: visita ?? null,
        totalNaSessao: total,
        conceitoHost: process.env.NEXT_PUBLIC_SITE_HOST ?? "rvland-page.vercel.app",
      })
    );
  } catch (err) {
    // aviso é cortesia: os cliques já estão gravados e não podem se perder por isso
    console.error("[cliques-conceito] falha ao avisar:", err);
  }
}

/** Cliques de um conceito, do mais recente para o mais antigo. */
export async function cliquesDoConceito(slug: string): Promise<CliqueConceito[]> {
  const linhas = await db
    .select()
    .from(cliquesConceito)
    .where(eq(cliquesConceito.slug, slug))
    .orderBy(desc(cliquesConceito.quando))
    .limit(500);
  return linhas as CliqueConceito[];
}
