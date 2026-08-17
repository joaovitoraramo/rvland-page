import { NextResponse } from "next/server";

import { gerarFaturasDaCompetencia } from "@/lib/servicos/gerar-faturas";
import { competenciaAtual } from "@/lib/dominio/tempo";

export const dynamic = "force-dynamic";

/**
 * Cron diário (vercel.json: 06:00 UTC = 03:00 SP).
 * A Vercel envia Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const competencia = competenciaAtual();
  const resultado = await gerarFaturasDaCompetencia(competencia);

  return NextResponse.json({ competencia, ...resultado });
}
