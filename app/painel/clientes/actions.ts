"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, clientes, licencas } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { registrarAuditoria } from "@/lib/audit";

const esquemaCliente = z.object({
  nome: z.string().trim().min(2, "Informe o nome."),
  razaoSocial: z.string().trim().optional(),
  documento: z.string().trim().optional(),
  email: z.union([z.literal(""), z.string().trim().email("Email inválido.")]).optional(),
  telefone: z.string().trim().optional(),
  notas: z.string().trim().optional(),
});

export type EstadoFormCliente = {
  erros?: Partial<Record<keyof z.infer<typeof esquemaCliente>, string>>;
  erro?: string;
};

function extrairErros(resultado: z.ZodSafeParseError<z.infer<typeof esquemaCliente>>) {
  const erros: EstadoFormCliente["erros"] = {};
  for (const issue of resultado.error.issues) {
    const campo = issue.path[0] as keyof z.infer<typeof esquemaCliente>;
    erros[campo] ??= issue.message;
  }
  return erros;
}

function lerFormCliente(formData: FormData) {
  return esquemaCliente.safeParse({
    nome: formData.get("nome"),
    razaoSocial: formData.get("razaoSocial") || undefined,
    documento: formData.get("documento") || undefined,
    email: formData.get("email") || "",
    telefone: formData.get("telefone") || undefined,
    notas: formData.get("notas") || undefined,
  });
}

export async function criarCliente(
  _estado: EstadoFormCliente,
  formData: FormData
): Promise<EstadoFormCliente> {
  const perfil = await exigirPermissao("clientes.criar");

  const dados = lerFormCliente(formData);
  if (!dados.success) return { erros: extrairErros(dados) };

  const [cliente] = await db
    .insert(clientes)
    .values({
      nome: dados.data.nome,
      razaoSocial: dados.data.razaoSocial || null,
      documento: dados.data.documento || null,
      email: dados.data.email || null,
      telefone: dados.data.telefone || null,
      notas: dados.data.notas || null,
    })
    .returning();

  await registrarAuditoria({
    ator: perfil,
    acao: "cliente.criado",
    entidade: "cliente",
    entidadeId: cliente.id,
    detalhes: { nome: cliente.nome },
  });

  redirect(`/painel/clientes/${cliente.id}`);
}

export async function atualizarCliente(
  clienteId: string,
  _estado: EstadoFormCliente,
  formData: FormData
): Promise<EstadoFormCliente> {
  const perfil = await exigirPermissao("clientes.editar");

  const dados = lerFormCliente(formData);
  if (!dados.success) return { erros: extrairErros(dados) };

  await db
    .update(clientes)
    .set({
      nome: dados.data.nome,
      razaoSocial: dados.data.razaoSocial || null,
      documento: dados.data.documento || null,
      email: dados.data.email || null,
      telefone: dados.data.telefone || null,
      notas: dados.data.notas || null,
      atualizadoEm: new Date(),
    })
    .where(eq(clientes.id, clienteId));

  await registrarAuditoria({
    ator: perfil,
    acao: "cliente.editado",
    entidade: "cliente",
    entidadeId: clienteId,
    detalhes: { nome: dados.data.nome },
  });

  redirect(`/painel/clientes/${clienteId}`);
}

export async function arquivarCliente(clienteId: string): Promise<void> {
  const perfil = await exigirPermissao("clientes.arquivar");

  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, clienteId));
  if (!cliente) return;

  const novoStatus = cliente.status === "ativo" ? "arquivado" : "ativo";
  await db
    .update(clientes)
    .set({ status: novoStatus, atualizadoEm: new Date() })
    .where(eq(clientes.id, clienteId));

  await registrarAuditoria({
    ator: perfil,
    acao: novoStatus === "arquivado" ? "cliente.arquivado" : "cliente.reativado",
    entidade: "cliente",
    entidadeId: clienteId,
    detalhes: { nome: cliente.nome },
  });

  revalidatePath("/painel/clientes");
  revalidatePath(`/painel/clientes/${clienteId}`);
}

// ── Atos deliberados de licença ───────────────────────────────────────────────

async function garantirLinhaLicenca(clienteId: string) {
  await db.insert(licencas).values({ clienteId }).onConflictDoNothing();
}

export type EstadoAcaoLicenca = { erro?: string; ok?: string };

export async function concederConfianca(
  clienteId: string,
  _estado: EstadoAcaoLicenca,
  formData: FormData
): Promise<EstadoAcaoLicenca> {
  const perfil = await exigirPermissao("licencas.conceder_confianca");

  const dias = Number(formData.get("dias"));
  if (!Number.isInteger(dias) || dias < 1) return { erro: "Informe um número de dias válido." };

  const config = await getConfig();
  if (!perfil.todasPermissoes && dias > config.maxDiasConfianca) {
    return {
      erro: `Seu grupo pode conceder no máximo ${config.maxDiasConfianca} dias. Peça ao dono para conceder mais.`,
    };
  }

  await garantirLinhaLicenca(clienteId);
  await db
    .update(licencas)
    .set({ diasConfianca: dias, atualizadoEm: new Date() })
    .where(eq(licencas.clienteId, clienteId));

  await registrarAuditoria({
    ator: perfil,
    acao: "licenca.confianca_concedida",
    entidade: "licenca",
    entidadeId: clienteId,
    detalhes: { dias },
  });

  revalidatePath(`/painel/clientes/${clienteId}`);
  return { ok: `${dias} dia(s) de confiança concedidos.` };
}

export async function bloquearManual(
  clienteId: string,
  _estado: EstadoAcaoLicenca,
  formData: FormData
): Promise<EstadoAcaoLicenca> {
  const perfil = await exigirPermissao("licencas.bloquear");

  const motivo = String(formData.get("motivo") ?? "").trim();
  if (motivo.length < 5) return { erro: "Descreva o motivo do bloqueio." };

  await garantirLinhaLicenca(clienteId);
  await db
    .update(licencas)
    .set({ bloqueioManual: true, bloqueioMotivo: motivo, atualizadoEm: new Date() })
    .where(eq(licencas.clienteId, clienteId));

  await registrarAuditoria({
    ator: perfil,
    acao: "licenca.bloqueio_manual",
    entidade: "licenca",
    entidadeId: clienteId,
    detalhes: { motivo },
  });

  revalidatePath(`/painel/clientes/${clienteId}`);
  return { ok: "Cliente bloqueado manualmente." };
}

export async function desbloquearManual(clienteId: string): Promise<void> {
  const perfil = await exigirPermissao("licencas.desbloquear");

  await garantirLinhaLicenca(clienteId);
  await db
    .update(licencas)
    .set({ bloqueioManual: false, bloqueioMotivo: null, atualizadoEm: new Date() })
    .where(eq(licencas.clienteId, clienteId));

  await registrarAuditoria({
    ator: perfil,
    acao: "licenca.desbloqueio_manual",
    entidade: "licenca",
    entidadeId: clienteId,
  });

  revalidatePath(`/painel/clientes/${clienteId}`);
}
