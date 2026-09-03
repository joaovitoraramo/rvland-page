"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, prospeccao } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { hojeSP } from "@/lib/dominio/tempo";
import { ETAPAS_FUNIL, ROTULO_STATUS_PROSPECT } from "@/lib/dominio/prospeccao";
import { importarProspeccao } from "@/lib/servicos/importar-prospeccao";

export type EstadoProspect = { ok?: string; erro?: string };

const esquema = z.object({
  status: z.enum(ETAPAS_FUNIL),
  notas: z.string().trim().max(8000).optional(),
});

/** Datas do funil se preenchem sozinhas na primeira vez que a etapa acontece. */
const CARIMBO: Partial<Record<(typeof ETAPAS_FUNIL)[number], "seguidoEm" | "comentadoEm" | "contatadoEm">> = {
  seguindo: "seguidoEm",
  comentou: "comentadoEm",
  contatado: "contatadoEm",
};

export async function atualizarProspect(
  id: string,
  _estado: EstadoProspect,
  formData: FormData
): Promise<EstadoProspect> {
  const perfil = await exigirPermissao("prospeccao.editar");

  const dados = esquema.safeParse({
    status: formData.get("status"),
    notas: String(formData.get("notas") ?? "").trim() || undefined,
  });
  if (!dados.success) return { erro: "Status inválido." };

  const [atual] = await db.select().from(prospeccao).where(eq(prospeccao.id, id));
  if (!atual) return { erro: "Prospect não encontrado." };

  const campoData = CARIMBO[dados.data.status];
  const carimbo =
    campoData && !atual[campoData] ? { [campoData]: hojeSP() } : {};

  await db
    .update(prospeccao)
    .set({
      status: dados.data.status,
      notas: dados.data.notas ?? null,
      atualizadoEm: new Date(),
      ...carimbo,
    })
    .where(eq(prospeccao.id, id));

  if (atual.status !== dados.data.status) {
    await registrarAuditoria({
      ator: perfil,
      acao: "prospeccao.status_alterado",
      entidade: "prospeccao",
      entidadeId: id,
      detalhes: { dominio: atual.dominio, de: atual.status, para: dados.data.status },
    });
  }

  revalidatePath("/painel/prospeccao");
  revalidatePath(`/painel/prospeccao/${id}`);
  return {
    ok:
      atual.status === dados.data.status
        ? "Notas salvas."
        : `Movido para ${ROTULO_STATUS_PROSPECT[dados.data.status]}.`,
  };
}

export type EstadoImportacao = { ok?: string; erro?: string };

export async function importarPlanilha(
  _estado: EstadoImportacao,
  formData: FormData
): Promise<EstadoImportacao> {
  const perfil = await exigirPermissao("prospeccao.importar");

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha o arquivo CSV da planilha." };
  }
  if (arquivo.size > 5_000_000) {
    return { erro: "Arquivo acima de 5 MB." };
  }

  const conteudo = await arquivo.text();
  const resultado = await importarProspeccao(conteudo);

  if (resultado.criados === 0 && resultado.atualizados === 0) {
    return { erro: resultado.erros[0] ?? "Nenhuma linha válida encontrada no arquivo." };
  }

  await registrarAuditoria({
    ator: perfil,
    acao: "prospeccao.importada",
    entidade: "prospeccao",
    detalhes: {
      arquivo: arquivo.name,
      criados: resultado.criados,
      atualizados: resultado.atualizados,
    },
  });

  revalidatePath("/painel/prospeccao");
  const aviso = resultado.erros.length > 0 ? ` (${resultado.erros.length} linha(s) ignorada(s))` : "";
  return {
    ok: `${resultado.criados} novo(s) e ${resultado.atualizados} atualizado(s)${aviso}. Status e notas foram preservados.`,
  };
}
