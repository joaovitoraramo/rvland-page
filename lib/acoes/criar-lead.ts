"use server";

import { db, leads } from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
import { esquemaLead, normalizarLead } from "@/lib/dominio/leads";

export type EstadoLeadPublico = { ok?: boolean; erro?: string };

/**
 * Ação pública dos dois formulários do site (PT e EN). O campo `website` é
 * honeypot: humano não vê; bot preenche e recebe um "sucesso" inofensivo.
 * A mensagem de erro é genérica de propósito — cada formulário valida no
 * cliente, no seu idioma, antes de enviar.
 */
export async function criarLead(entrada: {
  website?: string;
  origem: string;
  nome: string;
  negocio?: string;
  siteAtual?: string;
  canal: string;
  contato: string;
  mensagem: string;
}): Promise<EstadoLeadPublico> {
  if (entrada.website && entrada.website.trim() !== "") return { ok: true };

  const dados = esquemaLead.safeParse(entrada);
  if (!dados.success) return { erro: "invalid" };

  const lead = normalizarLead(dados.data);

  await db.insert(leads).values({
    origem: lead.origem,
    nome: lead.nome,
    negocio: lead.negocio ?? null,
    siteAtual: lead.siteAtual ?? null,
    canal: lead.canal,
    contato: lead.contato,
    mensagem: lead.mensagem,
  });

  await registrarAuditoria({
    ator: "sistema",
    acao: "lead.criado",
    entidade: "lead",
    detalhes: { origem: lead.origem, canal: lead.canal, nome: lead.nome },
  });

  return { ok: true };
}
