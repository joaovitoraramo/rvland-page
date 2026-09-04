import "server-only";
import { eq } from "drizzle-orm";

import { db, prospeccao } from "@/lib/db";
import { enviarTelegram } from "@/lib/telegram";
import { hojeSP } from "@/lib/dominio/tempo";
import {
  followUpsDevidos,
  mensagemFollowUps,
  type FollowUpDevido,
  type ProspectContatado,
} from "@/lib/dominio/follow-up";

/** Prospects que já esperaram o bastante por uma segunda mensagem. */
export async function listarFollowUps(hoje = hojeSP()): Promise<FollowUpDevido[]> {
  const linhas = await db
    .select({
      id: prospeccao.id,
      negocio: prospeccao.negocio,
      dominio: prospeccao.dominio,
      emails: prospeccao.emails,
      status: prospeccao.status,
      contatadoEm: prospeccao.contatadoEm,
      disparos: prospeccao.disparos,
      teste: prospeccao.teste,
    })
    .from(prospeccao);

  // registro do harness nunca vira cobrança de verdade
  const reais = linhas.filter((l) => !l.teste) as ProspectContatado[];
  return followUpsDevidos(reais, hoje);
}

/**
 * Aviso diário no Telegram. Nunca dispara e-mail sozinho: cold email errado
 * custa o remetente, então quem decide e escreve continua sendo o João.
 */
export async function avisarFollowUps(hoje = hojeSP()): Promise<{ avisados: number }> {
  const devidos = await listarFollowUps(hoje);
  const texto = mensagemFollowUps(devidos, hoje);
  if (!texto) return { avisados: 0 };

  await enviarTelegram(texto);
  return { avisados: devidos.length };
}

/** Registra que saiu mais uma mensagem para o prospect. */
export async function registrarDisparo({
  dominio,
  nota,
  hoje = hojeSP(),
}: {
  dominio: string;
  nota: string;
  hoje?: string;
}): Promise<{ disparos: number }> {
  const [antes] = await db
    .select({ notas: prospeccao.notas, disparos: prospeccao.disparos })
    .from(prospeccao)
    .where(eq(prospeccao.dominio, dominio));
  if (!antes) throw new Error(`prospect não encontrado: ${dominio}`);

  // nota do fluxo sempre concatena, nunca substitui
  const notas = antes.notas ? `${antes.notas}\n${nota}` : nota;
  const disparos = antes.disparos + 1;

  await db
    .update(prospeccao)
    .set({
      disparos,
      ultimoDisparoEm: hoje,
      status: "contatado",
      contatadoEm: hoje,
      notas,
      atualizadoEm: new Date(),
    })
    .where(eq(prospeccao.dominio, dominio));

  return { disparos };
}
