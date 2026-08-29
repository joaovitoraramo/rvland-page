"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, anexos } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase/admin";

const TAMANHO_MAXIMO = 20 * 1024 * 1024; // 20MB

export type EstadoAnexo = { erro?: string; ok?: string };

export async function enviarAnexo(
  clienteId: string,
  _estado: EstadoAnexo,
  formData: FormData
): Promise<EstadoAnexo> {
  const perfil = await exigirPermissao("contratos.editar");

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione um arquivo." };
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { erro: "Arquivo acima de 20MB." };
  }

  const nomeSeguro = arquivo.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const caminho = `${clienteId}/${crypto.randomUUID()}-${nomeSeguro}`;

  const storage = supabaseAdmin().storage.from("contratos");
  const { error } = await storage.upload(caminho, arquivo, {
    contentType: arquivo.type || "application/octet-stream",
  });
  if (error) return { erro: `Falha no upload: ${error.message}` };

  await db.insert(anexos).values({
    clienteId,
    nomeArquivo: arquivo.name,
    caminhoStorage: caminho,
    tamanhoBytes: arquivo.size,
    enviadoPor: perfil.nome,
  });

  await registrarAuditoria({
    ator: perfil,
    acao: "anexo.enviado",
    entidade: "anexo",
    entidadeId: clienteId,
    detalhes: { nomeArquivo: arquivo.name, tamanhoBytes: arquivo.size },
  });

  revalidatePath(`/painel/clientes/${clienteId}`);
  return { ok: "Anexo enviado." };
}

export async function removerAnexo(anexoId: string): Promise<void> {
  const perfil = await exigirPermissao("contratos.editar");

  const [anexo] = await db.select().from(anexos).where(eq(anexos.id, anexoId));
  if (!anexo) return;

  await supabaseAdmin().storage.from("contratos").remove([anexo.caminhoStorage]);
  await db.delete(anexos).where(eq(anexos.id, anexoId));

  await registrarAuditoria({
    ator: perfil,
    acao: "anexo.removido",
    entidade: "anexo",
    entidadeId: anexo.clienteId,
    detalhes: { nomeArquivo: anexo.nomeArquivo },
  });

  revalidatePath(`/painel/clientes/${anexo.clienteId}`);
}
