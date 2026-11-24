import "server-only";
import { eq } from "drizzle-orm";

import { db, configuracoes } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { registrarAuditoria } from "@/lib/audit";
import { enviarTelegram } from "@/lib/telegram";
import { getConfigHermes } from "@/lib/hermes/config";
import { assinarDocumentoHermesAmbiente } from "@/lib/crypto/hermes";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { gerarTokenParaServidor } from "@/lib/servicos/enrollment";
import {
  ativarSeAguardando,
  avancarTimestamp,
  clientePorRaiz,
  dadosLicencaCliente,
  gravarControleClone,
  gravarInstalacao,
  inserirEventos,
  instalacaoPorServidor,
  repoAtivacao,
  repoLimites,
  repoSolicitacoes,
  servidorAtivo,
} from "./hermes-repo";
import type { DepsAtivacao } from "./hermes-ativacao";
import type { DepsCredencial } from "./hermes-credencial";
import { BUCKET_INSTALADOR, CHAVE_CONFIG_INSTALADOR, parseReleaseInstalador, type DepsInstalador } from "./hermes-instalador";
import type { DepsSync } from "./hermes-sync";
import type { DepsEfeitos } from "./hermes-tipos";

/**
 * Composição de produção dos serviços do Hermes: liga os serviços puros ao
 * banco, à auditoria (entidade "hermes", ator "sistema"), ao Telegram e às
 * variáveis de ambiente (lidas por NOME; nunca logadas).
 */

const efeitos: DepsEfeitos = {
  agora: () => new Date(),
  auditar: (a) =>
    registrarAuditoria({
      ator: "sistema",
      acao: a.acao,
      entidade: "hermes",
      entidadeId: a.entidadeId,
      detalhes: a.detalhes,
    }),
  telegram: enviarTelegram,
};

const licenca = {
  async dadosLicenca(clienteId: string) {
    const [d, cfg] = await Promise.all([dadosLicencaCliente(clienteId), getConfig()]);
    return { ...d, modoPanico: cfg.modoPanico, maxDiasConfianca: cfg.maxDiasConfianca };
  },
  // só `hermes_enforcement`: o `modo_simulacao` global (Credit/Pic Price) NÃO afeta o Hermes
  async configEnforcement() {
    const c = await getConfigHermes();
    return { enforcementAtivo: c.enforcement.ativo, offlineHoras: c.offlineHoras };
  },
};

const agente = { servidorAtivo, instalacaoPorServidor };

export const depsSync: DepsSync = {
  ...efeitos,
  ...agente,
  ...licenca,
  avancarTimestamp,
  gravarInstalacao,
  gravarControleClone,
  ativarSeAguardando,
  inserirEventos,
  assinar: assinarDocumentoHermesAmbiente,
};

export const depsCredencial: DepsCredencial = {
  ...efeitos,
  ...agente,
  ...licenca,
  limites: repoLimites,
  credencialRegistro() {
    const usuario = process.env.HERMES_REGISTRO_USUARIO;
    const token = process.env.HERMES_REGISTRO_TOKEN;
    if (!usuario || !token) return null;
    const repositorio = process.env.HERMES_REGISTRO_REPOSITORIO || undefined;
    const exp = process.env.HERMES_REGISTRO_EXPIRA_EM ? new Date(process.env.HERMES_REGISTRO_EXPIRA_EM) : undefined;
    return { usuario, token, repositorio, expiraEm: exp && !Number.isNaN(exp.getTime()) ? exp : undefined };
  },
};

export const depsAtivacao: DepsAtivacao = {
  ...efeitos,
  limites: repoLimites,
  solicitacoes: repoSolicitacoes,
  clientePorRaiz,
  repo: repoAtivacao,
  gerarTokenEnroll: gerarTokenParaServidor,
};

export const depsInstalador: DepsInstalador = {
  agora: efeitos.agora,
  limites: repoLimites,
  async releaseInstalador() {
    const [l] = await db.select().from(configuracoes).where(eq(configuracoes.chave, CHAVE_CONFIG_INSTALADOR));
    return parseReleaseInstalador(l?.valor);
  },
  async urlAssinada(caminho, segundos) {
    try {
      const { data, error } = await supabaseAdmin().storage.from(BUCKET_INSTALADOR).createSignedUrl(caminho, segundos);
      return error || !data?.signedUrl ? null : data.signedUrl;
    } catch {
      return null;
    }
  },
};
