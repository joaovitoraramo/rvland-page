"use server";

import { revalidatePath } from "next/cache";

import { exigirPermissao } from "@/lib/auth";
import { depsEscritaPainel } from "@/lib/servicos/hermes-painel-runtime";
import {
  definirEnforcementPainel,
  fixarVersaoAgentePainel,
  forcarAtualizacaoContainer,
  gerarChavePainel,
  revogarChavePainel,
  trocarCanalPainel,
} from "@/lib/servicos/hermes-painel";

/**
 * Server Actions do painel do Hermes. Só: autorizar (permissão por ação), tirar os campos do
 * formulário e chamar o serviço (que valida com zod, aplica as regras e AUDITA). Mensagens de erro
 * são do serviço, em pt-BR, e nunca citam segredos.
 */

export type EstadoAcaoHermes = { erro?: string; ok?: string };

export type EstadoChaveHermes = {
  erro?: string;
  /** Chave em claro: aparece UMA vez, só nesta resposta. Nunca é gravada nem auditada. */
  chave?: string;
  prefixo?: string;
  tipo?: "instalacao" | "adocao";
  expiraEm?: string;
  clienteNome?: string;
};

const campo = (f: FormData, nome: string): string => String(f.get(nome) ?? "");

function revalidarHermes(instalacaoId?: string) {
  revalidatePath("/painel/hermes");
  if (instalacaoId) revalidatePath(`/painel/hermes/${instalacaoId}`);
}

// ── chaves ──────────────────────────────────────────────────────────────────

export async function gerarChaveHermes(_estado: EstadoChaveHermes, formData: FormData): Promise<EstadoChaveHermes> {
  const perfil = await exigirPermissao("servidores.cadastrar");
  const instalacaoId = campo(formData, "instalacaoId");
  const r = await gerarChavePainel(
    {
      tipo: campo(formData, "tipo") as "instalacao" | "adocao",
      clienteId: campo(formData, "clienteId"),
      canal: campo(formData, "canal") as "stable" | "preview",
      ...(instalacaoId ? { instalacaoId } : {}),
      por: perfil.nome,
    },
    depsEscritaPainel(perfil)
  );
  if (!r.ok) return { erro: r.erro };
  revalidatePath("/painel/hermes/chaves");
  revalidarHermes();
  return { chave: r.chave, prefixo: r.prefixo, tipo: r.tipo, expiraEm: r.expiraEm, clienteNome: r.clienteNome };
}

export async function revogarChaveHermes(_estado: EstadoAcaoHermes, formData: FormData): Promise<EstadoAcaoHermes> {
  const perfil = await exigirPermissao("servidores.cadastrar");
  const r = await revogarChavePainel({ chaveId: campo(formData, "chaveId"), por: perfil.nome }, depsEscritaPainel(perfil));
  if (!r.ok) return { erro: r.erro };
  revalidatePath("/painel/hermes/chaves");
  revalidarHermes();
  return { ok: "Chave revogada." };
}

// ── canal ───────────────────────────────────────────────────────────────────

export async function trocarCanalHermes(_estado: EstadoAcaoHermes, formData: FormData): Promise<EstadoAcaoHermes> {
  const perfil = await exigirPermissao("servidores.cadastrar");
  const instalacaoId = campo(formData, "instalacaoId");
  const r = await trocarCanalPainel(
    { instalacaoId, canal: campo(formData, "canal") as "stable" | "preview", por: perfil.nome },
    depsEscritaPainel(perfil)
  );
  if (!r.ok) return { erro: r.erro };
  revalidarHermes(instalacaoId);
  return { ok: r.mudou ? `Canal ${r.canal}. Vale no próximo contato do agente (até 1 min).` : `Já estava no canal ${r.canal}.` };
}

// ── enforcement global ──────────────────────────────────────────────────────

export async function definirEnforcementHermes(_estado: EstadoAcaoHermes, formData: FormData): Promise<EstadoAcaoHermes> {
  const perfil = await exigirPermissao("plataforma.simulacao");
  const r = await definirEnforcementPainel(
    {
      alvo: campo(formData, "alvo") as "valendo" | "simulacao",
      confirmacao: campo(formData, "confirmacao"),
      motivo: campo(formData, "motivo"),
      por: perfil.nome,
    },
    depsEscritaPainel(perfil)
  );
  if (!r.ok) return { erro: r.erro };
  revalidarHermes();
  return {
    ok: !r.mudou
      ? `Já estava em ${r.ativo ? "valendo" : "simulação"}.`
      : r.ativo
        ? "Hermes VALENDO: instalações com licença bloqueante passam a ser bloqueadas no próximo contato."
        : "Hermes em simulação: nada é bloqueado, só registrado.",
  };
}

// ── atualização forçada ─────────────────────────────────────────────────────

export async function fixarVersaoAgenteHermes(_estado: EstadoAcaoHermes, formData: FormData): Promise<EstadoAcaoHermes> {
  const perfil = await exigirPermissao("agente.forcar_update");
  const instalacaoId = campo(formData, "instalacaoId");
  const bruta = campo(formData, "versao").trim();
  const versao = bruta === "" || bruta === "auto" ? null : bruta;
  const r = await fixarVersaoAgentePainel({ instalacaoId, versao, por: perfil.nome }, depsEscritaPainel(perfil));
  if (!r.ok) return { erro: r.erro };
  revalidarHermes(instalacaoId);
  return {
    ok: !r.mudou
      ? "Nada a mudar."
      : r.versao
        ? `Agente fixado na versão ${r.versao}. O agente atualiza no próximo contato (até 1 min).`
        : "Agente de volta ao automático (última versão estável).",
  };
}

/** Container (digest_alvo): sem suporte no servidor; ver `forcarAtualizacaoContainer`. Não escreve nem audita. */
export async function forcarAtualizacaoContainerHermes(_estado: EstadoAcaoHermes, formData: FormData): Promise<EstadoAcaoHermes> {
  await exigirPermissao("agente.forcar_update");
  const r = forcarAtualizacaoContainer({ instalacaoId: campo(formData, "instalacaoId") });
  return { erro: r.erro };
}
