import "server-only";
import { inArray, sql } from "drizzle-orm";

import { db, prospeccao } from "@/lib/db";
import { parseCsvProspeccao } from "@/lib/dominio/prospeccao";

export type ResultadoImportacao = {
  criados: number;
  atualizados: number;
  erros: string[];
};

/**
 * Importa a planilha da varredura. Reimportar é seguro: o upsert atualiza os
 * dados de diagnóstico (que vêm da varredura) e NUNCA toca em status, notas e
 * datas — esses são trabalho do João dentro do painel.
 */
export async function importarProspeccao(conteudoCsv: string): Promise<ResultadoImportacao> {
  const { linhas, erros } = parseCsvProspeccao(conteudoCsv);
  if (linhas.length === 0) return { criados: 0, atualizados: 0, erros };

  const dominios = linhas.map((l) => l.dominio);
  const existentes = new Set(
    (
      await db
        .select({ dominio: prospeccao.dominio })
        .from(prospeccao)
        .where(inArray(prospeccao.dominio, dominios))
    ).map((r) => r.dominio)
  );

  // lotes de 100: evita estourar o limite de parâmetros do driver
  for (let i = 0; i < linhas.length; i += 100) {
    const lote = linhas.slice(i, i + 100);
    await db
      .insert(prospeccao)
      .values(lote)
      .onConflictDoUpdate({
        target: prospeccao.dominio,
        set: {
          negocio: sql`excluded.negocio`,
          nicho: sql`excluded.nicho`,
          cidade: sql`excluded.cidade`,
          perfilCidade: sql`excluded.perfil_cidade`,
          screenshot: sql`excluded.screenshot`,
          potencial: sql`excluded.potencial`,
          notaSite: sql`excluded.nota_site`,
          builder: sql`excluded.builder`,
          temBooking: sql`excluded.tem_booking`,
          anoCopyright: sql`excluded.ano_copyright`,
          // contato corrigido à mão no painel é soberano: a varredura não
          // encontrou, o João encontrou, e reimportar não pode apagar isso
          instagram: sql`case when ${prospeccao.contatoManual} then ${prospeccao.instagram} else excluded.instagram end`,
          seguidores: sql`case when ${prospeccao.contatoManual} then ${prospeccao.seguidores} else excluded.seguidores end`,
          emails: sql`case when ${prospeccao.contatoManual} then ${prospeccao.emails} else excluded.emails end`,
          diagnostico: sql`excluded.diagnostico`,
          comoAbordar: sql`excluded.como_abordar`,
          atualizadoEm: new Date(),
        },
      });
  }

  const criados = linhas.filter((l) => !existentes.has(l.dominio)).length;
  return { criados, atualizados: linhas.length - criados, erros };
}
