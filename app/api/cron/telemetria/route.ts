import { NextResponse } from "next/server";
import { and, eq, lt, sql } from "drizzle-orm";

import { db, telemetriaHistorico, servidores, eventos } from "@/lib/db";

export const dynamic = "force-dynamic";

const RETENCAO_DIAS = 90;
const OFFLINE_MIN = 8; // silencioso além disto vira evento

/**
 * Cron diário: poda o histórico de telemetria e registra agente offline.
 * A Vercel envia Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const corte = new Date(Date.now() - RETENCAO_DIAS * 86400_000);
  const podadas = await db
    .delete(telemetriaHistorico)
    .where(lt(telemetriaHistorico.coletadoEm, corte))
    .returning({ id: telemetriaHistorico.id });

  // Servidores ativos silenciosos → evento agente_offline (uma vez)
  const limite = new Date(Date.now() - OFFLINE_MIN * 60_000);
  const silenciosos = await db
    .select({ id: servidores.id, nome: servidores.nome, ultimo: servidores.ultimoContatoEm })
    .from(servidores)
    .where(and(eq(servidores.status, "ativo"), lt(servidores.ultimoContatoEm, limite)));

  let alertados = 0;
  for (const s of silenciosos) {
    const [ultimo] = await db
      .select({ tipo: eventos.tipo })
      .from(eventos)
      .where(eq(eventos.servidorId, s.id))
      .orderBy(sql`${eventos.criadoEm} desc`)
      .limit(1);
    // evita repetir: só alerta se o último evento não foi já um offline
    if (ultimo?.tipo === "agente_offline") continue;
    await db.insert(eventos).values({
      servidorId: s.id,
      tipo: "agente_offline",
      severidade: "aviso",
      mensagem: `Agente silencioso há mais de ${OFFLINE_MIN} min — verifique o servidor.`,
      dados: { ultimoContato: s.ultimo?.toISOString() ?? null },
    });
    alertados++;
  }

  return NextResponse.json({ podadas: podadas.length, alertados });
}
