"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigirPermissao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { gerarTokenDoCliente, mudarStatusToken, setStatusServico } from "@/lib/picprice/servidor";

export type EstadoTokenPicPrice = { token?: string; erro?: string };

export async function gerarTokenPicPrice(
  _estado: EstadoTokenPicPrice,
  formData: FormData
): Promise<EstadoTokenPicPrice> {
  const perfil = await exigirPermissao("picprice.gerenciar");
  const clienteId = z.string().uuid().safeParse(formData.get("clienteId"));
  if (!clienteId.success) return { erro: "Cliente inválido." };
  try {
    const { token, cnpj } = await gerarTokenDoCliente(clienteId.data);
    await registrarAuditoria({
      ator: perfil,
      acao: formData.get("troca") ? "picprice.token_trocado" : "picprice.token_gerado",
      entidade: "picprice",
      entidadeId: clienteId.data,
      detalhes: { cnpj, prefixo: token.slice(0, 10) },
    });
    revalidatePath("/painel/picprice");
    return { token };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

export async function revogarTokenPicPrice(formData: FormData): Promise<void> {
  const perfil = await exigirPermissao("picprice.gerenciar");
  const clienteId = z.string().uuid().parse(formData.get("clienteId"));
  await mudarStatusToken(clienteId, "revogado");
  await registrarAuditoria({ ator: perfil, acao: "picprice.token_revogado", entidade: "picprice", entidadeId: clienteId });
  revalidatePath("/painel/picprice");
}

export async function reativarTokenPicPrice(formData: FormData): Promise<void> {
  const perfil = await exigirPermissao("picprice.gerenciar");
  const clienteId = z.string().uuid().parse(formData.get("clienteId"));
  await mudarStatusToken(clienteId, "ativo");
  await registrarAuditoria({ ator: perfil, acao: "picprice.token_reativado", entidade: "picprice", entidadeId: clienteId });
  revalidatePath("/painel/picprice");
}

const esquemaStatus = z.object({
  estado: z.enum(["operante", "manutencao"]),
  mensagem: z.string().trim().max(240).optional(),
  previsao: z.string().trim().max(80).optional(),
});

export async function salvarStatusPicPrice(formData: FormData): Promise<void> {
  const perfil = await exigirPermissao("picprice.gerenciar");
  const s = esquemaStatus.parse({
    estado: formData.get("estado"),
    mensagem: formData.get("mensagem") || undefined,
    previsao: formData.get("previsao") || undefined,
  });
  await setStatusServico({ estado: s.estado, mensagem: s.mensagem ?? null, previsao: s.previsao ?? null });
  await registrarAuditoria({ ator: perfil, acao: "picprice.status_alterado", entidade: "picprice", detalhes: s });
  revalidatePath("/painel/picprice");
}
