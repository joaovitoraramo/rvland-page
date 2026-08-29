"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, leads } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { STATUS_LEAD } from "@/lib/dominio/leads";

export type EstadoLead = { ok?: string; erro?: string };

const esquemaAtualizacao = z.object({
  status: z.enum(STATUS_LEAD),
  notas: z.string().trim().max(8000).optional(),
});

export async function atualizarLead(
  leadId: string,
  _estado: EstadoLead,
  formData: FormData
): Promise<EstadoLead> {
  const perfil = await exigirPermissao("leads.editar");

  const dados = esquemaAtualizacao.safeParse({
    status: formData.get("status"),
    notas: String(formData.get("notas") ?? "").trim() || undefined,
  });
  if (!dados.success) return { erro: "Status inválido." };

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) return { erro: "Lead não encontrado." };

  await db
    .update(leads)
    .set({
      status: dados.data.status,
      notas: dados.data.notas ?? null,
      atualizadoEm: new Date(),
    })
    .where(eq(leads.id, leadId));

  if (lead.status !== dados.data.status) {
    await registrarAuditoria({
      ator: perfil,
      acao: "lead.status_alterado",
      entidade: "lead",
      entidadeId: leadId,
      detalhes: { de: lead.status, para: dados.data.status },
    });
  }

  revalidatePath(`/painel/leads/${leadId}`);
  revalidatePath("/painel/leads");
  return { ok: "Lead atualizado." };
}
