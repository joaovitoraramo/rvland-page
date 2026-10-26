"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigirPermissao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { definirLimiteDiario, definirValidadeToken, gerarTokenDoCliente, mudarStatusToken, setStatusServico } from "@/lib/picprice/servidor";

export type EstadoTokenPicPrice = { token?: string; erro?: string };

/** Presets de validade do token. "custom" usa a data informada; "nao_expira" = NULL. Padrão: 1 mês. */
const PRESETS_VALIDADE = ["nao_expira", "1m", "3m", "6m", "1a", "custom"] as const;
type PresetValidade = (typeof PRESETS_VALIDADE)[number];

function calcularExpiraEm(preset: PresetValidade, custom?: string | null): Date | null {
  if (preset === "nao_expira") return null;
  if (preset === "custom") {
    const d = custom ? new Date(custom) : null;
    if (!d || Number.isNaN(d.getTime())) throw new Error("Data de validade inválida.");
    return d;
  }
  const d = new Date();
  if (preset === "1m") d.setMonth(d.getMonth() + 1);
  else if (preset === "3m") d.setMonth(d.getMonth() + 3);
  else if (preset === "6m") d.setMonth(d.getMonth() + 6);
  else if (preset === "1a") d.setFullYear(d.getFullYear() + 1);
  return d;
}

export async function gerarTokenPicPrice(
  _estado: EstadoTokenPicPrice,
  formData: FormData
): Promise<EstadoTokenPicPrice> {
  const perfil = await exigirPermissao("picprice.gerenciar");
  const clienteId = z.string().uuid().safeParse(formData.get("clienteId"));
  if (!clienteId.success) return { erro: "Cliente inválido." };
  const presetRaw = formData.get("validade");
  const preset = (PRESETS_VALIDADE as readonly string[]).includes(String(presetRaw)) ? (presetRaw as PresetValidade) : "1m";
  try {
    const expiraEm = calcularExpiraEm(preset, formData.get("validadeCustom") as string | null);
    const { token, cnpj } = await gerarTokenDoCliente(clienteId.data, expiraEm);
    await registrarAuditoria({
      ator: perfil,
      acao: formData.get("troca") ? "picprice.token_trocado" : "picprice.token_gerado",
      entidade: "picprice",
      entidadeId: clienteId.data,
      detalhes: { cnpj, prefixo: token.slice(0, 10), expiraEm: expiraEm?.toISOString() ?? null },
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

const esquemaLimite = z.object({
  clienteId: z.string().uuid(),
  limite: z.coerce.number().int("Use um número inteiro.").min(1, "O limite mínimo é 1.").max(1_000_000),
});

/** Limite diário de requisições do token (padrão 200). */
export async function salvarLimitePicPrice(formData: FormData): Promise<void> {
  const perfil = await exigirPermissao("picprice.gerenciar");
  const d = esquemaLimite.parse({ clienteId: formData.get("clienteId"), limite: formData.get("limite") });
  const { anterior } = await definirLimiteDiario(d.clienteId, d.limite);
  await registrarAuditoria({
    ator: perfil,
    acao: "picprice.limite_alterado",
    entidade: "picprice",
    entidadeId: d.clienteId,
    detalhes: { limiteDiario: d.limite, anterior },
  });
  revalidatePath("/painel/picprice");
}

const esquemaValidade = z.object({
  clienteId: z.string().uuid(),
  validade: z.enum(PRESETS_VALIDADE),
  validadeCustom: z.string().trim().optional(),
});

/** Define/estende a validade do token sem trocá-lo. */
export async function salvarValidadePicPrice(formData: FormData): Promise<void> {
  const perfil = await exigirPermissao("picprice.gerenciar");
  const d = esquemaValidade.parse({
    clienteId: formData.get("clienteId"),
    validade: formData.get("validade"),
    validadeCustom: formData.get("validadeCustom") || undefined,
  });
  const expiraEm = calcularExpiraEm(d.validade, d.validadeCustom);
  const { anterior } = await definirValidadeToken(d.clienteId, expiraEm);
  await registrarAuditoria({
    ator: perfil,
    acao: "picprice.validade_alterada",
    entidade: "picprice",
    entidadeId: d.clienteId,
    detalhes: { expiraEm: expiraEm?.toISOString() ?? null, anterior: anterior?.toISOString() ?? null },
  });
  revalidatePath("/painel/picprice");
}
