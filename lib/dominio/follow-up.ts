/**
 * Quem está esperando follow-up.
 *
 * Cold email não morre por falta de talento, morre por falta de segunda
 * mensagem: a maioria das respostas vem do follow-up, não do primeiro contato.
 * Do outro lado, o terceiro contato sem resposta queima o remetente para todos
 * os próximos. Este módulo guarda essa disciplina em um lugar só.
 */

import { addDias, compararDatas } from "@/lib/dominio/tempo";

/** Antes disso, insistir parece afobação. */
export const ESPERA_MINIMA_DIAS = 5;

/** Janela ideal; depois dela ainda vale mandar, só entra como atrasado. */
export const JANELA_FOLLOW_UP: [number, number] = [5, 7];

/** Teto de mensagens por prospect. A terceira vira incômodo. */
export const MAXIMO_DISPAROS = 2;

export type ProspectContatado = {
  id: string;
  negocio: string;
  dominio: string;
  emails: string | null;
  status: string;
  contatadoEm: string | null;
  /** quantas mensagens já saíram para este prospect */
  disparos: number;
};

export type FollowUpDevido = ProspectContatado & {
  diasDesde: number;
  atrasado: boolean;
};

function diasEntre(de: string, ate: string): number {
  const ms = Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

/** Quem já esperou o bastante e ainda tem direito a mais uma mensagem. */
export function followUpsDevidos(
  prospects: ProspectContatado[],
  hoje: string
): FollowUpDevido[] {
  return prospects
    .filter((p) => p.status === "contatado")
    .filter((p) => p.disparos < MAXIMO_DISPAROS)
    .filter((p) => (p.emails ?? "").trim().length > 0)
    .filter((p) => p.contatadoEm !== null)
    .map((p) => {
      const diasDesde = diasEntre(p.contatadoEm!, hoje);
      return { ...p, diasDesde, atrasado: diasDesde > JANELA_FOLLOW_UP[1] };
    })
    .filter((p) => p.diasDesde >= ESPERA_MINIMA_DIAS)
    .sort((a, b) => compararDatas(a.contatadoEm!, b.contatadoEm!));
}

/**
 * Cold email responde melhor de terça a quinta de manhã: segunda o sujeito
 * está cavando a semana, sexta ele já foi embora.
 */
export function proximoDiaUtilDeDisparo(data: string): string {
  let dia = data;
  for (let i = 0; i < 7; i++) {
    const semana = new Date(`${dia}T00:00:00Z`).getUTCDay(); // 0=dom
    if (semana >= 2 && semana <= 4) return dia;
    dia = addDias(dia, 1);
  }
  return dia;
}

/** Aviso no Telegram. Nunca manda sozinho: quem decide e escreve é o João. */
export function mensagemFollowUps(
  devidos: FollowUpDevido[],
  hoje: string
): string | null {
  if (devidos.length === 0) return null;

  const linhas = [
    devidos.length === 1
      ? "📬 1 prospect esperando follow-up"
      : `📬 ${devidos.length} prospects esperando follow-up`,
    "",
  ];

  for (const d of devidos) {
    const marca = d.atrasado ? " (atrasado)" : "";
    linhas.push(`${d.negocio} · ${d.diasDesde} dias${marca}`);
    linhas.push(`  ${d.emails}`);
  }

  const disparo = proximoDiaUtilDeDisparo(hoje);
  linhas.push("");
  linhas.push(
    disparo === hoje
      ? "Hoje é bom dia para disparar."
      : `Melhor disparar em ${disparo} (terça a quinta responde mais).`
  );
  linhas.push("Confira antes se ele respondeu: quem respondeu não leva cobrança.");

  return linhas.join("\n");
}
