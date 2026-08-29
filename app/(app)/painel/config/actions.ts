"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, grupos, gruposPermissoes, perfis } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { getConfig, setConfig } from "@/lib/config";
import { registrarAuditoria } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PERMISSOES } from "@/lib/dominio/permissoes";

// ── Plataforma: pânico, simulação, teto de confiança ─────────────────────────

export type EstadoConfig = { erro?: string; ok?: string };

export async function alternarPanico(
  _estado: EstadoConfig,
  formData: FormData
): Promise<EstadoConfig> {
  const perfil = await exigirPermissao("plataforma.panico");

  const confirmacao = String(formData.get("confirmacao") ?? "").trim().toUpperCase();
  const config = await getConfig();
  const ligar = !config.modoPanico;

  const esperado = ligar ? "SUSPENDER" : "REATIVAR";
  if (confirmacao !== esperado) {
    return { erro: `Digite ${esperado} para confirmar.` };
  }

  await setConfig("modo_panico", { ativo: ligar });

  await registrarAuditoria({
    ator: perfil,
    acao: ligar ? "plataforma.panico_ligado" : "plataforma.panico_desligado",
    entidade: "plataforma",
    detalhes: { de: config.modoPanico, para: ligar },
  });

  revalidatePath("/painel", "layout");
  return { ok: ligar ? "Bloqueios suspensos em toda a plataforma." : "Bloqueios reativados." };
}

export async function alternarSimulacao(
  _estado: EstadoConfig,
  formData: FormData
): Promise<EstadoConfig> {
  const perfil = await exigirPermissao("plataforma.simulacao");

  const confirmacao = String(formData.get("confirmacao") ?? "").trim().toUpperCase();
  const config = await getConfig();
  const ligar = !config.modoSimulacao;

  // Desligar simulação = bloqueios passam a valer de verdade (Fase 2)
  const esperado = ligar ? "SIMULAR" : "VALER";
  if (confirmacao !== esperado) {
    return { erro: `Digite ${esperado} para confirmar.` };
  }

  await setConfig("modo_simulacao", { ativo: ligar });

  await registrarAuditoria({
    ator: perfil,
    acao: ligar ? "plataforma.simulacao_ligada" : "plataforma.simulacao_desligada",
    entidade: "plataforma",
    detalhes: { de: config.modoSimulacao, para: ligar },
  });

  revalidatePath("/painel", "layout");
  return { ok: ligar ? "Modo simulação ligado." : "Modo simulação DESLIGADO — bloqueios valem." };
}

export async function salvarTetoConfianca(
  _estado: EstadoConfig,
  formData: FormData
): Promise<EstadoConfig> {
  const perfil = await exigirPermissao("plataforma.panico");

  const dias = Number(formData.get("dias"));
  if (!Number.isInteger(dias) || dias < 0 || dias > 90) {
    return { erro: "Teto deve ser entre 0 e 90 dias." };
  }

  const config = await getConfig();
  await setConfig("max_dias_confianca", { dias });

  await registrarAuditoria({
    ator: perfil,
    acao: "plataforma.teto_confianca_alterado",
    entidade: "plataforma",
    detalhes: { de: config.maxDiasConfianca, para: dias },
  });

  revalidatePath("/painel/config");
  return { ok: `Teto de confiança: ${dias} dias.` };
}

// ── Grupos ───────────────────────────────────────────────────────────────────

const esquemaGrupo = z.object({
  nome: z.string().trim().min(2, "Informe o nome do grupo."),
  descricao: z.string().trim().optional(),
});

export type EstadoGrupo = { erro?: string; ok?: string };

const CHAVES_VALIDAS = new Set<string>(PERMISSOES.map((p) => p.chave));

export async function salvarGrupo(
  grupoId: string | null,
  _estado: EstadoGrupo,
  formData: FormData
): Promise<EstadoGrupo> {
  const perfil = await exigirPermissao("plataforma.grupos");

  const dados = esquemaGrupo.safeParse({
    nome: formData.get("nome"),
    descricao: formData.get("descricao") || undefined,
  });
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Dados inválidos." };

  const selecionadas = formData
    .getAll("permissoes")
    .map(String)
    .filter((p) => CHAVES_VALIDAS.has(p));

  let id = grupoId;

  if (id) {
    const [grupo] = await db.select().from(grupos).where(eq(grupos.id, id));
    if (!grupo) return { erro: "Grupo não encontrado." };
    if (grupo.todasPermissoes) {
      return { erro: "O grupo Dono não é editável." };
    }

    await db
      .update(grupos)
      .set({ nome: dados.data.nome, descricao: dados.data.descricao ?? null })
      .where(eq(grupos.id, id));
    await db.delete(gruposPermissoes).where(eq(gruposPermissoes.grupoId, id));
  } else {
    const [criado] = await db
      .insert(grupos)
      .values({ nome: dados.data.nome, descricao: dados.data.descricao ?? null })
      .returning();
    id = criado.id;
  }

  if (selecionadas.length > 0) {
    await db
      .insert(gruposPermissoes)
      .values(selecionadas.map((permissao) => ({ grupoId: id!, permissao })));
  }

  await registrarAuditoria({
    ator: perfil,
    acao: grupoId ? "grupo.editado" : "grupo.criado",
    entidade: "grupo",
    entidadeId: id!,
    detalhes: { nome: dados.data.nome, permissoes: selecionadas },
  });

  redirect("/painel/config/grupos");
}

export async function excluirGrupo(grupoId: string): Promise<void> {
  const perfil = await exigirPermissao("plataforma.grupos");

  const [grupo] = await db.select().from(grupos).where(eq(grupos.id, grupoId));
  if (!grupo || grupo.todasPermissoes) return;

  const usuarios = await db.select().from(perfis).where(eq(perfis.grupoId, grupoId));
  if (usuarios.length > 0) return; // grupo com usuários não pode ser excluído

  await db.delete(grupos).where(eq(grupos.id, grupoId));

  await registrarAuditoria({
    ator: perfil,
    acao: "grupo.excluido",
    entidade: "grupo",
    entidadeId: grupoId,
    detalhes: { nome: grupo.nome },
  });

  revalidatePath("/painel/config/grupos");
}

// ── Usuários ─────────────────────────────────────────────────────────────────

const esquemaUsuario = z.object({
  nome: z.string().trim().min(2, "Informe o nome."),
  email: z.string().trim().email("Email inválido."),
  senha: z.string().min(8, "Senha provisória com no mínimo 8 caracteres."),
  grupoId: z.string().uuid("Selecione o grupo."),
});

export type EstadoUsuario = {
  erros?: Partial<Record<"nome" | "email" | "senha" | "grupoId", string>>;
  erro?: string;
};

export async function criarUsuario(
  _estado: EstadoUsuario,
  formData: FormData
): Promise<EstadoUsuario> {
  const perfil = await exigirPermissao("plataforma.usuarios");

  const dados = esquemaUsuario.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    senha: formData.get("senha"),
    grupoId: formData.get("grupoId"),
  });

  if (!dados.success) {
    const erros: EstadoUsuario["erros"] = {};
    for (const issue of dados.error.issues) {
      const campo = issue.path[0] as keyof NonNullable<EstadoUsuario["erros"]>;
      erros[campo] ??= issue.message;
    }
    return { erros };
  }

  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email: dados.data.email,
    password: dados.data.senha,
    email_confirm: true,
  });
  if (error) return { erro: `Supabase: ${error.message}` };

  await db.insert(perfis).values({
    id: data.user.id,
    nome: dados.data.nome,
    email: dados.data.email,
    grupoId: dados.data.grupoId,
  });

  await registrarAuditoria({
    ator: perfil,
    acao: "usuario.criado",
    entidade: "usuario",
    entidadeId: data.user.id,
    detalhes: { email: dados.data.email, grupoId: dados.data.grupoId },
  });

  redirect("/painel/config/usuarios");
}

export async function alternarUsuarioAtivo(usuarioId: string): Promise<void> {
  const perfil = await exigirPermissao("plataforma.usuarios");

  if (usuarioId === perfil.id) return; // não desativar a si mesmo

  const [usuario] = await db.select().from(perfis).where(eq(perfis.id, usuarioId));
  if (!usuario) return;

  await db.update(perfis).set({ ativo: !usuario.ativo }).where(eq(perfis.id, usuarioId));

  await registrarAuditoria({
    ator: perfil,
    acao: usuario.ativo ? "usuario.desativado" : "usuario.reativado",
    entidade: "usuario",
    entidadeId: usuarioId,
    detalhes: { email: usuario.email },
  });

  revalidatePath("/painel/config/usuarios");
}

export async function trocarGrupoUsuario(
  usuarioId: string,
  _estado: EstadoUsuario,
  formData: FormData
): Promise<EstadoUsuario> {
  const perfil = await exigirPermissao("plataforma.usuarios");

  const grupoId = String(formData.get("grupoId") ?? "");
  const [grupo] = await db.select().from(grupos).where(eq(grupos.id, grupoId));
  if (!grupo) return { erro: "Grupo inválido." };

  const [usuario] = await db.select().from(perfis).where(eq(perfis.id, usuarioId));
  if (!usuario) return { erro: "Usuário não encontrado." };

  await db.update(perfis).set({ grupoId }).where(eq(perfis.id, usuarioId));

  await registrarAuditoria({
    ator: perfil,
    acao: "usuario.grupo_alterado",
    entidade: "usuario",
    entidadeId: usuarioId,
    detalhes: { email: usuario.email, para: grupo.nome },
  });

  revalidatePath("/painel/config/usuarios");
  return {};
}
