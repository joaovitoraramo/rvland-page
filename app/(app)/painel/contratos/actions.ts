"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, contratos, contratosPrecos } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { reaisParaCentavos } from "@/lib/formato";
import { competenciaDe, competenciaAtual, hojeSP } from "@/lib/dominio/tempo";

const esquemaContrato = z.object({
  clienteId: z.string().uuid(),
  tipo: z.enum(["recorrente", "fechado"]),
  titulo: z.string().trim().min(2, "Informe o título."),
  descricao: z.string().trim().optional(),
  valor: z.string().trim().min(1, "Informe o valor."),
  diaVencimento: z.string().optional(),
  toleranciaDias: z.string().optional(),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de início."),
});

export type EstadoFormContrato = {
  erros?: Partial<Record<"titulo" | "valor" | "diaVencimento" | "toleranciaDias" | "inicio", string>>;
  erro?: string;
};

export async function criarContrato(
  _estado: EstadoFormContrato,
  formData: FormData
): Promise<EstadoFormContrato> {
  const perfil = await exigirPermissao("contratos.criar");

  const dados = esquemaContrato.safeParse({
    clienteId: formData.get("clienteId"),
    tipo: formData.get("tipo"),
    titulo: formData.get("titulo"),
    descricao: formData.get("descricao") || undefined,
    valor: formData.get("valor"),
    diaVencimento: formData.get("diaVencimento") || undefined,
    toleranciaDias: formData.get("toleranciaDias") || undefined,
    inicio: formData.get("inicio"),
  });

  if (!dados.success) {
    const erros: EstadoFormContrato["erros"] = {};
    for (const issue of dados.error.issues) {
      const campo = issue.path[0] as keyof NonNullable<EstadoFormContrato["erros"]>;
      erros[campo] ??= issue.message;
    }
    return { erros };
  }

  const valorCentavos = reaisParaCentavos(dados.data.valor);
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) {
    return { erros: { valor: "Valor inválido. Ex: 1.500,00" } };
  }

  let diaVencimento: number | null = null;
  let toleranciaDias = 4;

  if (dados.data.tipo === "recorrente") {
    diaVencimento = Number(dados.data.diaVencimento);
    if (!Number.isInteger(diaVencimento) || diaVencimento < 1 || diaVencimento > 28) {
      return { erros: { diaVencimento: "Dia de vencimento deve ser entre 1 e 28." } };
    }
    toleranciaDias = Number(dados.data.toleranciaDias ?? 4);
    if (!Number.isInteger(toleranciaDias) || toleranciaDias < 0 || toleranciaDias > 60) {
      return { erros: { toleranciaDias: "Tolerância deve ser entre 0 e 60 dias." } };
    }
  }

  const [contrato] = await db
    .insert(contratos)
    .values({
      clienteId: dados.data.clienteId,
      tipo: dados.data.tipo,
      titulo: dados.data.titulo,
      descricao: dados.data.descricao || null,
      modeloCobranca: "fixo",
      diaVencimento,
      toleranciaDias,
      inicio: dados.data.inicio,
    })
    .returning();

  // Valor inicial vira a primeira vigência, valendo desde a competência do início
  await db.insert(contratosPrecos).values({
    contratoId: contrato.id,
    valorCentavos,
    vigenteDesde: competenciaDe(dados.data.inicio),
    criadoPor: perfil.nome,
  });

  await registrarAuditoria({
    ator: perfil,
    acao: "contrato.criado",
    entidade: "contrato",
    entidadeId: contrato.id,
    detalhes: { titulo: contrato.titulo, tipo: contrato.tipo, valorCentavos },
  });

  redirect(`/painel/contratos/${contrato.id}`);
}

export type EstadoNovaVigencia = { erro?: string; ok?: string };

export async function novaVigenciaPreco(
  contratoId: string,
  _estado: EstadoNovaVigencia,
  formData: FormData
): Promise<EstadoNovaVigencia> {
  const perfil = await exigirPermissao("financeiro.alterar_preco");

  const valorCentavos = reaisParaCentavos(String(formData.get("valor") ?? ""));
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) {
    return { erro: "Valor inválido. Ex: 1.800,00" };
  }

  const vigenteDesde = String(formData.get("vigenteDesde") ?? "");
  if (!/^\d{4}-\d{2}-01$/.test(vigenteDesde)) {
    return { erro: "Competência inválida." };
  }

  // Nunca mexer no passado: vigência só a partir da competência atual
  if (vigenteDesde < competenciaAtual()) {
    return { erro: "A vigência não pode começar em competência passada." };
  }

  const [existente] = await db
    .select()
    .from(contratosPrecos)
    .where(eq(contratosPrecos.contratoId, contratoId));
  if (!existente) return { erro: "Contrato sem vigência inicial." };

  try {
    await db.insert(contratosPrecos).values({
      contratoId,
      valorCentavos,
      vigenteDesde,
      criadoPor: perfil.nome,
    });
  } catch {
    return { erro: "Já existe vigência nessa competência." };
  }

  await registrarAuditoria({
    ator: perfil,
    acao: "contrato.preco_alterado",
    entidade: "contrato",
    entidadeId: contratoId,
    detalhes: { valorCentavos, vigenteDesde },
  });

  revalidatePath(`/painel/contratos/${contratoId}`);
  return { ok: "Nova vigência registrada." };
}

export async function encerrarContrato(contratoId: string): Promise<void> {
  const perfil = await exigirPermissao("contratos.encerrar");

  const [contrato] = await db.select().from(contratos).where(eq(contratos.id, contratoId));
  if (!contrato || contrato.status === "encerrado") return;

  await db
    .update(contratos)
    .set({ status: "encerrado", fim: hojeSP() })
    .where(eq(contratos.id, contratoId));

  await registrarAuditoria({
    ator: perfil,
    acao: "contrato.encerrado",
    entidade: "contrato",
    entidadeId: contratoId,
    detalhes: { titulo: contrato.titulo, clienteId: contrato.clienteId },
  });

  revalidatePath(`/painel/contratos/${contratoId}`);
  revalidatePath(`/painel/clientes/${contrato.clienteId}`);
}
