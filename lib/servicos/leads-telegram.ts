import "server-only";
import { revalidatePath } from "next/cache";
import { desc, eq, notInArray, sql } from "drizzle-orm";

import { db, leads } from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
import { formatarDataBR, hojeSP } from "@/lib/dominio/tempo";
import { rotuloCanal } from "@/lib/dominio/leads";
import {
  concatenarNota,
  mensagemLeads,
  parseComandoLead,
  rotuloStatusLead,
} from "@/lib/dominio/telegram";

/** /leads: funil vivo (fora ganho/perdido), mais recente primeiro. */
export async function executarComandoLeads(): Promise<string[]> {
  const linhas = await db
    .select()
    .from(leads)
    .where(notInArray(leads.status, ["ganho", "perdido"]))
    .orderBy(desc(leads.criadoEm))
    .limit(100);

  return mensagemLeads(
    linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      negocio: l.negocio,
      origem: l.origem,
      canal: rotuloCanal[l.canal],
      contato: l.contato,
      status: l.status,
      criadoEm: l.criadoEm,
    }))
  );
}

/** /lead <id> <status> [nota]: muda status; nota SEMPRE concatena. */
export async function executarComandoLead(texto: string): Promise<string> {
  const parse = parseComandoLead(texto);
  if (!parse.ok) return parse.erro;
  const { idCurto, status, nota } = parse.comando;

  const candidatos = await db
    .select()
    .from(leads)
    .where(sql`${leads.id}::text like ${idCurto + "%"}`)
    .limit(3);

  if (candidatos.length === 0) return `Nenhum lead encontrado com id ${idCurto}.`;
  if (candidatos.length > 1) {
    return `Mais de um lead começa com ${idCurto} — use mais caracteres do id.`;
  }
  const lead = candidatos[0];

  const notas = nota ? concatenarNota(lead.notas, nota, formatarDataBR(hojeSP())) : lead.notas;

  await db
    .update(leads)
    .set({ status, notas, atualizadoEm: new Date() })
    .where(eq(leads.id, lead.id));

  if (lead.status !== status) {
    await registrarAuditoria({
      ator: "sistema",
      acao: "lead.status_alterado",
      entidade: "lead",
      entidadeId: lead.id,
      detalhes: { de: lead.status, para: status, via: "telegram" },
    });
  }
  if (nota) {
    await registrarAuditoria({
      ator: "sistema",
      acao: "lead.nota_adicionada",
      entidade: "lead",
      entidadeId: lead.id,
      detalhes: { via: "telegram" },
    });
  }

  revalidatePath("/painel/leads");
  revalidatePath(`/painel/leads/${lead.id}`);

  const partes = [
    lead.status === status
      ? `✅ ${lead.nome}: status mantido em ${rotuloStatusLead[status]}.`
      : `✅ ${lead.nome}: ${rotuloStatusLead[lead.status]} → ${rotuloStatusLead[status]}.`,
  ];
  if (nota) partes.push("📝 Nota acrescentada às existentes.");
  return partes.join("\n");
}
