"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, servidores, servicoGerenciados, comandos } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { gerarTokenParaServidor } from "@/lib/servicos/enrollment";
import { descreverModulos, modulosDoForm, type ModulosServidor } from "@/lib/dominio/agente-modulos";
import { normalizaSO, validarNomeServico } from "@/lib/dominio/servidor-so";

// ── Servidor ─────────────────────────────────────────────────────────────────

const esquemaServidor = z.object({
  clienteId: z.string().uuid("Selecione o cliente."),
  nome: z.string().trim().min(2, "Informe um nome."),
  descricao: z.string().trim().optional(),
  host: z.string().trim().optional(),
  so: z.string().trim().optional(),
});

export type EstadoServidor = {
  erros?: Partial<Record<"clienteId" | "nome", string>>;
  erro?: string;
  // sucesso: o token é revelado UMA vez para montar o comando de instalação
  servidorId?: string;
  token?: string;
  modulos?: ModulosServidor;
};

export async function criarServidor(
  _estado: EstadoServidor,
  formData: FormData
): Promise<EstadoServidor> {
  const perfil = await exigirPermissao("servidores.cadastrar");

  const dados = esquemaServidor.safeParse({
    clienteId: formData.get("clienteId"),
    nome: formData.get("nome"),
    descricao: formData.get("descricao") || undefined,
    host: formData.get("host") || undefined,
    so: formData.get("so") || undefined,
  });
  const modulos = modulosDoForm(formData);
  if (!modulos.licenca && !modulos.picprice) return { erro: "Ligue pelo menos um módulo do agente." };
  if (!dados.success) {
    const erros: EstadoServidor["erros"] = {};
    for (const i of dados.error.issues) {
      const c = i.path[0] as keyof NonNullable<EstadoServidor["erros"]>;
      erros[c] ??= i.message;
    }
    return { erros };
  }

  const [servidor] = await db
    .insert(servidores)
    .values({
      clienteId: dados.data.clienteId,
      nome: dados.data.nome,
      descricao: dados.data.descricao || null,
      host: dados.data.host || null,
      so: dados.data.so || null,
      status: "pendente",
      moduloLicenca: modulos.licenca,
      moduloPicprice: modulos.picprice,
    })
    .returning();

  const token = await gerarTokenParaServidor(servidor.id);

  await registrarAuditoria({
    ator: perfil,
    acao: "servidor.cadastrado",
    entidade: "servidor",
    entidadeId: servidor.id,
    detalhes: { nome: servidor.nome, clienteId: servidor.clienteId, modulos },
  });

  return { servidorId: servidor.id, token, modulos };
}

export type EstadoAcao = { erro?: string; ok?: string };

export type EstadoToken = { token?: string; erro?: string; modulos?: ModulosServidor };

/** Regenera o token e o revela UMA vez (volta o servidor a pendente). */
export async function regenerarToken(servidorId: string): Promise<EstadoToken> {
  const perfil = await exigirPermissao("servidores.cadastrar");
  const [srv] = await db.select().from(servidores).where(eq(servidores.id, servidorId));
  if (!srv) return { erro: "Servidor não encontrado." };

  // volta a pendente para reinstalar/reparear
  await db
    .update(servidores)
    .set({ status: "pendente", agentePubkey: null })
    .where(eq(servidores.id, servidorId));
  const token = await gerarTokenParaServidor(servidorId);

  await registrarAuditoria({
    ator: perfil,
    acao: "servidor.token_regenerado",
    entidade: "servidor",
    entidadeId: servidorId,
  });
  revalidatePath(`/painel/servidores/${servidorId}`);
  return { token, modulos: { licenca: srv.moduloLicenca, picprice: srv.moduloPicprice } };
}

/**
 * Liga/desliga os módulos do agente. Vale no próximo heartbeat (vai no lease
 * assinado). Desligar `licenca` faz o agente parar de aplicar a licença: ele
 * nunca para nem religa serviço por causa dela.
 */
export async function definirModulos(
  servidorId: string,
  _estado: EstadoAcao,
  formData: FormData
): Promise<EstadoAcao> {
  const perfil = await exigirPermissao("servidores.editar");
  const [srv] = await db.select().from(servidores).where(eq(servidores.id, servidorId));
  if (!srv) return { erro: "Servidor não encontrado." };
  const novo = modulosDoForm(formData);
  if (!novo.licenca && !novo.picprice) return { erro: "Ligue pelo menos um módulo." };
  const anterior = { licenca: srv.moduloLicenca, picprice: srv.moduloPicprice };

  await db
    .update(servidores)
    .set({ moduloLicenca: novo.licenca, moduloPicprice: novo.picprice })
    .where(eq(servidores.id, servidorId));
  await registrarAuditoria({
    ator: perfil,
    acao: "servidor.modulos_alterados",
    entidade: "servidor",
    entidadeId: servidorId,
    detalhes: { anterior, novo },
  });
  revalidatePath(`/painel/servidores/${servidorId}`);
  return { ok: `Módulos: ${descreverModulos(novo)}. Vale no próximo contato do agente (até 1 min).` };
}

export async function revogarServidor(servidorId: string): Promise<void> {
  const perfil = await exigirPermissao("servidores.cadastrar");
  const [srv] = await db.select().from(servidores).where(eq(servidores.id, servidorId));
  if (!srv) return;

  await db.update(servidores).set({ status: "revogado" }).where(eq(servidores.id, servidorId));
  await registrarAuditoria({
    ator: perfil,
    acao: "servidor.revogado",
    entidade: "servidor",
    entidadeId: servidorId,
    detalhes: { nome: srv.nome },
  });
  revalidatePath(`/painel/servidores/${servidorId}`);
  revalidatePath("/painel/servidores");
}

export async function definirManutencao(
  servidorId: string,
  _estado: EstadoAcao,
  formData: FormData
): Promise<EstadoAcao> {
  const perfil = await exigirPermissao("servidores.manutencao");
  const ate = String(formData.get("ate") ?? "");
  const dt = ate ? new Date(ate) : null;

  await db
    .update(servidores)
    .set({ manutencaoAte: dt })
    .where(eq(servidores.id, servidorId));

  await registrarAuditoria({
    ator: perfil,
    acao: dt ? "servidor.manutencao_ligada" : "servidor.manutencao_desligada",
    entidade: "servidor",
    entidadeId: servidorId,
    detalhes: { ate: dt?.toISOString() ?? null },
  });
  revalidatePath(`/painel/servidores/${servidorId}`);
  return { ok: dt ? "Janela de manutenção definida." : "Manutenção removida." };
}

// ── Serviços gerenciados ─────────────────────────────────────────────────────

const esquemaServico = z.object({
  nome: z.string().trim().min(1, "Informe um rótulo."),
  // a regra do nome depende do SO do servidor (validarNomeServico)
  unidade: z.string().trim().min(1, "Informe o serviço."),
  licenciado: z.enum(["sim", "nao"]),
});

export type EstadoServico = { erro?: string; ok?: string };

export async function adicionarServico(
  servidorId: string,
  _estado: EstadoServico,
  formData: FormData
): Promise<EstadoServico> {
  const perfil = await exigirPermissao("servidores.editar");

  const dados = esquemaServico.safeParse({
    nome: formData.get("nome"),
    unidade: formData.get("unidade"),
    licenciado: formData.get("licenciado") ?? "sim",
  });
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Dados inválidos." };

  // Linux: unidade systemd (app.service). Windows: Service Name do Gerenciador de Serviços (wildfly).
  const [srv] = await db.select({ so: servidores.so }).from(servidores).where(eq(servidores.id, servidorId)).limit(1);
  const nome = validarNomeServico(dados.data.unidade, normalizaSO(srv?.so));
  if (!nome.ok) return { erro: nome.erro };

  await db.insert(servicoGerenciados).values({
    servidorId,
    nome: dados.data.nome,
    unidadeSystemd: nome.valor,
    licenciado: dados.data.licenciado === "sim",
  });

  await registrarAuditoria({
    ator: perfil,
    acao: "servidor.servico_adicionado",
    entidade: "servidor",
    entidadeId: servidorId,
    detalhes: { unidade: nome.valor, licenciado: dados.data.licenciado === "sim" },
  });
  revalidatePath(`/painel/servidores/${servidorId}`);
  return { ok: "Serviço adicionado." };
}

export async function removerServico(servicoId: string, servidorId: string): Promise<void> {
  const perfil = await exigirPermissao("servidores.editar");
  await db.delete(servicoGerenciados).where(eq(servicoGerenciados.id, servicoId));
  await registrarAuditoria({
    ator: perfil,
    acao: "servidor.servico_removido",
    entidade: "servidor",
    entidadeId: servidorId,
    detalhes: { servicoId },
  });
  revalidatePath(`/painel/servidores/${servidorId}`);
}

/** Alterna se o serviço é licenciado (se o bloqueio o afeta). */
export async function alternarLicencaServico(
  servicoId: string,
  servidorId: string
): Promise<void> {
  const perfil = await exigirPermissao("servidores.editar");
  const [svc] = await db
    .select()
    .from(servicoGerenciados)
    .where(eq(servicoGerenciados.id, servicoId));
  if (!svc) return;

  const novo = !svc.licenciado;
  await db
    .update(servicoGerenciados)
    .set({ licenciado: novo, atualizadoEm: new Date() })
    .where(eq(servicoGerenciados.id, servicoId));

  await registrarAuditoria({
    ator: perfil,
    acao: "servidor.servico_licenca_alterada",
    entidade: "servidor",
    entidadeId: servidorId,
    detalhes: { unidade: svc.unidadeSystemd, licenciado: novo },
  });
  revalidatePath(`/painel/servidores/${servidorId}`);
}

// ── Fila de comandos (o agente executa via systemctl no próximo heartbeat) ────

const VERBOS = new Set(["status", "start", "stop", "update"]);

export async function enfileirarComando(
  servidorId: string,
  verbo: string,
  servicoId: string | null
): Promise<void> {
  const perfil = await exigirPermissao("servidores.executar");
  if (!VERBOS.has(verbo)) return;

  const [srv] = await db.select().from(servidores).where(eq(servidores.id, servidorId));
  if (!srv || srv.status !== "ativo") return;

  await db.insert(comandos).values({
    servidorId,
    servicoId: servicoId ?? null,
    verbo: verbo as "status" | "start" | "stop" | "update",
    estado: "pendente",
    criadoPor: perfil.nome,
  });

  await registrarAuditoria({
    ator: perfil,
    acao: `servidor.comando_${verbo}`,
    entidade: "servidor",
    entidadeId: servidorId,
    detalhes: { verbo, servicoId },
  });
  revalidatePath(`/painel/servidores/${servidorId}`);
}
