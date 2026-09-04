import { NextResponse } from "next/server";

import { gerarFaturasDaCompetencia } from "@/lib/servicos/gerar-faturas";
import { competenciaAtual } from "@/lib/dominio/tempo";
import { avisarViradasDeLicenca } from "@/lib/servicos/avisos-licenca";
import { avisarFollowUps } from "@/lib/servicos/follow-ups";

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

  // Etapa 2: avisos de virada de licença no Telegram. Falha aqui não pode
  // derrubar a geração de faturas — o cron responde 200 do mesmo jeito.
  let avisosLicenca = 0;
  try {
    avisosLicenca = (await avisarViradasDeLicenca()).enviados;
  } catch (err) {
    console.error("[cron/faturas] avisos de licença falharam:", err);
  }

  // Etapa 3: prospects esperando follow-up. Só avisa; quem escreve é o João.
  let followUps = 0;
  try {
    followUps = (await avisarFollowUps()).avisados;
  } catch (err) {
    console.error("[cron/faturas] aviso de follow-ups falhou:", err);
  }

  return NextResponse.json({ competencia, ...resultado, avisosLicenca, followUps });
}
