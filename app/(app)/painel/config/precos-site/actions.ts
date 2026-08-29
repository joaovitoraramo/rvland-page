"use server";

import { revalidatePath } from "next/cache";

import { exigirPermissao } from "@/lib/auth";
import { getPricingEn, setConfig } from "@/lib/config";
import { registrarAuditoria } from "@/lib/audit";
import { dolaresParaCentavos } from "@/lib/formato";
import { esquemaPricingEn } from "@/lib/dominio/preco-site";

export type EstadoPrecos = { ok?: string; erro?: string };

export async function salvarPrecosSite(
  _estado: EstadoPrecos,
  formData: FormData
): Promise<EstadoPrecos> {
  const perfil = await exigirPermissao("site.precos");

  const centavos = (campo: string) => dolaresParaCentavos(String(formData.get(campo) ?? ""));
  const ligado = (campo: string) => formData.get(campo) === "on";

  const candidato = {
    moeda: "USD",
    planos: {
      full: { ativo: ligado("full_ativo"), valorCentavos: centavos("full_valor") },
      m6: { ativo: ligado("m6_ativo"), valorCentavos: centavos("m6_valor"), parcelas: 6 },
      m12: { ativo: ligado("m12_ativo"), valorCentavos: centavos("m12_valor"), parcelas: 12 },
    },
    care: {
      valorCentavos: centavos("care_valor"),
      mesesInclusos: Number(formData.get("care_meses")),
    },
  };

  const dados = esquemaPricingEn.safeParse(candidato);
  if (!dados.success) return { erro: "Valores inválidos — confira os campos." };
  if (
    !dados.data.planos.full.ativo &&
    !dados.data.planos.m6.ativo &&
    !dados.data.planos.m12.ativo
  ) {
    return { erro: "Pelo menos um plano precisa ficar ativo." };
  }

  const anterior = await getPricingEn();
  await setConfig("pricing_en", dados.data as Record<string, unknown>);

  await registrarAuditoria({
    ator: perfil,
    acao: "site.precos_alterados",
    entidade: "plataforma",
    detalhes: { de: anterior, para: dados.data },
  });

  revalidatePath("/en");
  return { ok: "Preços salvos — /en atualizada." };
}
