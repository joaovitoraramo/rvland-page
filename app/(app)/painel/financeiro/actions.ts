"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, contratos, faturas, pagamentos } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { reaisParaCentavos } from "@/lib/formato";
import { parseCompetenciaHumana } from "@/lib/dominio/tempo";
import { registrarPagamentoNaFatura } from "@/lib/servicos/registrar-pagamento";

// ── Fatura manual (avulsa, histórica ou parcela de contrato fechado) ─────────

const esquemaFaturaManual = z.object({
  contratoId: z.string().uuid("Selecione o contrato."),
  competencia: z.string().trim().min(1, "Informe a competência."),
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento."),
  valor: z.string().trim().min(1, "Informe o valor."),
  historica: z.enum(["sim", "nao"]),
  notas: z.string().trim().optional(),
  // registro de fatura já quitada (típico do histórico)
  jaQuitada: z.enum(["sim", "nao"]).optional(),
  pagoEm: z.string().optional(),
});

export type EstadoFaturaManual = {
  erros?: Partial<Record<"contratoId" | "competencia" | "vencimento" | "valor" | "pagoEm", string>>;
  erro?: string;
};

export async function criarFaturaManual(
  _estado: EstadoFaturaManual,
  formData: FormData
): Promise<EstadoFaturaManual> {
  const perfil = await exigirPermissao("financeiro.editar_cobranca");

  const dados = esquemaFaturaManual.safeParse({
    contratoId: formData.get("contratoId"),
    competencia: formData.get("competencia"),
    vencimento: formData.get("vencimento"),
    valor: formData.get("valor"),
    historica: formData.get("historica") ?? "nao",
    notas: formData.get("notas") || undefined,
    jaQuitada: formData.get("jaQuitada") ?? "nao",
    pagoEm: formData.get("pagoEm") || undefined,
  });

  if (!dados.success) {
    const erros: EstadoFaturaManual["erros"] = {};
    for (const issue of dados.error.issues) {
      const campo = issue.path[0] as keyof NonNullable<EstadoFaturaManual["erros"]>;
      erros[campo] ??= issue.message;
    }
    return { erros };
  }

  const valorCentavos = reaisParaCentavos(dados.data.valor);
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) {
    return { erros: { valor: "Valor inválido. Ex: 1.500,00" } };
  }

  const [contrato] = await db
    .select()
    .from(contratos)
    .where(eq(contratos.id, dados.data.contratoId));
  if (!contrato) return { erro: "Contrato não encontrado." };

  const historica = dados.data.historica === "sim";
  const jaQuitada = dados.data.jaQuitada === "sim";

  if (jaQuitada && !dados.data.pagoEm) {
    return { erros: { pagoEm: "Informe a data do pagamento." } };
  }

  // Aceita "03/2026" (digitado) e "2026-03" (input type=month do Chrome)
  const competencia = parseCompetenciaHumana(dados.data.competencia);
  if (!competencia) {
    return { erros: { competencia: "Use o formato MM/AAAA. Ex: 03/2026" } };
  }

  const [fatura] = await db
    .insert(faturas)
    .values({
      contratoId: contrato.id,
      clienteId: contrato.clienteId,
      competencia,
      vencimento: dados.data.vencimento,
      valorCentavos,
      historica,
      notas: dados.data.notas || null,
      ...(jaQuitada
        ? {
            status: "quitada" as const,
            pagoCentavos: valorCentavos,
            quitadaEm: new Date(),
          }
        : {}),
    })
    .onConflictDoNothing()
    .returning();

  if (!fatura) {
    return { erro: "Já existe fatura desse contrato nessa competência." };
  }

  if (jaQuitada) {
    await db.insert(pagamentos).values({
      faturaId: fatura.id,
      valorCentavos,
      pagoEm: dados.data.pagoEm!,
      notas: historica ? "Lançamento de histórico" : null,
      criadoPor: perfil.nome,
    });
  }

  await registrarAuditoria({
    ator: perfil,
    acao: historica ? "fatura.historica_lancada" : "fatura.criada_manual",
    entidade: "fatura",
    entidadeId: fatura.id,
    // clienteId nos detalhes: a timeline do cliente filtra por ele
    detalhes: { clienteId: contrato.clienteId, competencia, valorCentavos, jaQuitada },
  });

  redirect(`/painel/financeiro/faturas/${fatura.id}`);
}

// ── Pagamento (com renovação automática da licença) ──────────────────────────

export type EstadoPagamento = { erro?: string; ok?: string };

export async function lancarPagamento(
  faturaId: string,
  _estado: EstadoPagamento,
  formData: FormData
): Promise<EstadoPagamento> {
  const perfil = await exigirPermissao("financeiro.lancar_pagamento");

  const valorCentavos = reaisParaCentavos(String(formData.get("valor") ?? ""));
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) {
    return { erro: "Valor inválido. Ex: 1.500,00" };
  }

  const pagoEm = String(formData.get("pagoEm") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pagoEm)) return { erro: "Informe a data do pagamento." };

  const forma = String(formData.get("forma") ?? "").trim() || null;
  const notas = String(formData.get("notas") ?? "").trim() || null;

  const resultado = await registrarPagamentoNaFatura({
    faturaId,
    valorCentavos,
    pagoEm,
    forma,
    notas,
    criadoPor: perfil.nome,
    ator: perfil,
  });
  if (!resultado.ok) return { erro: resultado.erro };

  revalidatePath(`/painel/financeiro/faturas/${faturaId}`);
  revalidatePath(`/painel/clientes/${resultado.clienteId}`);
  revalidatePath("/painel/financeiro");
  revalidatePath("/painel");

  return {
    ok: resultado.quitou
      ? resultado.historica
        ? "Fatura histórica quitada (sem efeito em licença)."
        : "Fatura quitada — licença renovada."
      : "Pagamento parcial registrado; fatura segue aberta.",
  };
}

// ── Editar / cancelar cobrança ───────────────────────────────────────────────

export type EstadoEditarFatura = { erro?: string; ok?: string };

export async function editarFatura(
  faturaId: string,
  _estado: EstadoEditarFatura,
  formData: FormData
): Promise<EstadoEditarFatura> {
  const perfil = await exigirPermissao("financeiro.editar_cobranca");

  const [fatura] = await db.select().from(faturas).where(eq(faturas.id, faturaId));
  if (!fatura) return { erro: "Fatura não encontrada." };
  if (fatura.status !== "aberta") return { erro: "Só faturas abertas podem ser editadas." };

  const vencimento = String(formData.get("vencimento") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) return { erro: "Vencimento inválido." };

  const valorCentavos = reaisParaCentavos(String(formData.get("valor") ?? ""));
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) return { erro: "Valor inválido." };

  await db
    .update(faturas)
    .set({ vencimento, valorCentavos })
    .where(eq(faturas.id, faturaId));

  await registrarAuditoria({
    ator: perfil,
    acao: "fatura.editada",
    entidade: "fatura",
    entidadeId: faturaId,
    detalhes: {
      de: { vencimento: fatura.vencimento, valorCentavos: fatura.valorCentavos },
      para: { vencimento, valorCentavos },
    },
  });

  revalidatePath(`/painel/financeiro/faturas/${faturaId}`);
  return { ok: "Fatura atualizada." };
}

export async function cancelarFatura(
  faturaId: string,
  _estado: EstadoEditarFatura,
  formData: FormData
): Promise<EstadoEditarFatura> {
  const perfil = await exigirPermissao("financeiro.editar_cobranca");

  const motivo = String(formData.get("motivo") ?? "").trim();
  if (motivo.length < 5) return { erro: "Descreva o motivo do cancelamento." };

  const [fatura] = await db.select().from(faturas).where(eq(faturas.id, faturaId));
  if (!fatura) return { erro: "Fatura não encontrada." };
  if (fatura.status !== "aberta") return { erro: "Só faturas abertas podem ser canceladas." };

  await db.update(faturas).set({ status: "cancelada" }).where(eq(faturas.id, faturaId));

  await registrarAuditoria({
    ator: perfil,
    acao: "fatura.cancelada",
    entidade: "fatura",
    entidadeId: faturaId,
    detalhes: { motivo, clienteId: fatura.clienteId },
  });

  revalidatePath(`/painel/financeiro/faturas/${faturaId}`);
  revalidatePath(`/painel/clientes/${fatura.clienteId}`);
  return { ok: "Fatura cancelada." };
}
