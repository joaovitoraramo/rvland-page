import "server-only";
import { and, eq, sql } from "drizzle-orm";

import { db, prospeccao, visitasConceito } from "@/lib/db";
import { enviarTelegram } from "@/lib/telegram";
import {
  dispositivoDe,
  ehRobo,
  marcarComoTeste,
  mensagemVisita,
  type VisitaConceito,
} from "@/lib/dominio/visitas-conceito";

export type EntradaVisita = {
  slug: string;
  visitante: string;
  sessao: string;
  segundos: number;
  referencia: string | null;
  /** ?rvland=teste: avisa no Telegram com prefixo e não grava */
  teste?: boolean;
  userAgent: string | null;
  cidade: string | null;
  pais: string | null;
};

/**
 * Grava a abertura de um conceito e avisa no Telegram na primeira vez.
 *
 * Descarta robô antes de tocar no banco: o varredor de link do provedor de
 * e-mail abre a URL minutos depois do envio, e contar isso faria o primeiro
 * aviso ser sobre um antivírus. Atualização de tempo cai na mesma linha (a
 * sessão é única) e não dispara mensagem nova.
 */
export async function registrarVisita(entrada: EntradaVisita): Promise<{
  gravada: boolean;
  motivo?: "robo" | "teste";
}> {
  if (ehRobo(entrada.userAgent)) return { gravada: false, motivo: "robo" };

  const { tipo, sistema } = dispositivoDe(entrada.userAgent ?? "");

  // ?rvland=teste: o navegador manda a abertura uma vez só; aqui é aviso e nada mais
  if (entrada.teste) {
    await avisarTeste({ ...entrada, dispositivo: tipo, sistema });
    return { gravada: false, motivo: "teste" };
  }

  // saber se a sessão já existia antes de gravar é o que separa "abriu agora"
  // de "continua lendo": só a primeira vira mensagem no Telegram
  const [jaConhecida] = await db
    .select({ id: visitasConceito.id })
    .from(visitasConceito)
    .where(eq(visitasConceito.sessao, entrada.sessao))
    .limit(1);

  const [linha] = await db
    .insert(visitasConceito)
    .values({
      slug: entrada.slug,
      visitante: entrada.visitante,
      sessao: entrada.sessao,
      dispositivo: tipo,
      sistema,
      cidade: entrada.cidade,
      pais: entrada.pais,
      referencia: entrada.referencia,
      segundos: entrada.segundos,
    })
    .onConflictDoUpdate({
      target: visitasConceito.sessao,
      // o tempo só cresce: recarga fora de ordem não pode encolher a leitura
      set: { segundos: sql`greatest(${visitasConceito.segundos}, excluded.segundos)` },
    })
    .returning();

  if (!jaConhecida) await avisar(linha);

  return { gravada: true };
}

async function avisar(linha: typeof visitasConceito.$inferSelect) {
  try {
    const [prospect] = await db
      .select({ negocio: prospeccao.negocio, teste: prospeccao.teste })
      .from(prospeccao)
      .where(sql`${prospeccao.conceito}->>'url' like ${`%/c/${linha.slug}`}`)
      .limit(1);

    // o harness grava visitas de mentira: elas não podem virar alerta
    if (prospect?.teste) return;

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(visitasConceito)
      .where(
        and(
          eq(visitasConceito.slug, linha.slug),
          eq(visitasConceito.visitante, linha.visitante)
        )
      );

    await enviarTelegram(
      mensagemVisita({
        visita: linha as VisitaConceito,
        negocio: prospect?.negocio ?? linha.slug,
        totalDoVisitante: total,
      })
    );
  } catch (err) {
    // aviso é cortesia: a visita já está gravada e não pode se perder por isso
    console.error("[visitas-conceito] falha ao avisar:", err);
  }
}

async function avisarTeste(e: EntradaVisita & { dispositivo: VisitaConceito["dispositivo"]; sistema: string | null }) {
  try {
    const negocio = await negocioDoSlug(e.slug);
    await enviarTelegram(
      marcarComoTeste(
        mensagemVisita({
          visita: { id: "teste", slug: e.slug, visitante: e.visitante, sessao: e.sessao, quando: new Date(), dispositivo: e.dispositivo, sistema: e.sistema, cidade: e.cidade, pais: e.pais, referencia: e.referencia, segundos: e.segundos },
          negocio,
          totalDoVisitante: 1,
        })
      )
    );
  } catch (err) {
    console.error("[visitas-conceito] falha ao avisar teste:", err);
  }
}

/** Nome do negócio dono do conceito, ou o slug quando não há prospect. */
export async function negocioDoSlug(slug: string): Promise<string> {
  const [prospect] = await db
    .select({ negocio: prospeccao.negocio })
    .from(prospeccao)
    .where(sql`${prospeccao.conceito}->>'url' like ${`%/c/${slug}`}`)
    .limit(1);
  return prospect?.negocio ?? slug;
}

/** Visitas de um conceito, da mais recente para a mais antiga. */
export async function visitasDoConceito(slug: string): Promise<VisitaConceito[]> {
  const linhas = await db
    .select()
    .from(visitasConceito)
    .where(eq(visitasConceito.slug, slug))
    .orderBy(sql`${visitasConceito.quando} desc`)
    .limit(200);
  return linhas as VisitaConceito[];
}
