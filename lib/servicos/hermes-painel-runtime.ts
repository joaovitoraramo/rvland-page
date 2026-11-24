import "server-only";

import { getConfig } from "@/lib/config";
import { getConfigHermes, setConfigHermes } from "@/lib/hermes/config";
import { registrarAuditoria } from "@/lib/audit";
import type { PerfilSessao } from "@/lib/auth";
import { dadosLicencaCliente } from "./hermes-repo";
import {
  chavesDaInstalacao,
  eventosHermesDoServidor,
  instalacaoBruta,
  listarInstalacoesBrutas,
  repoEscritaPainel,
  versoesAgentePublicadas,
} from "./hermes-painel-repo";
import type { DepsEscritaPainel, DepsLeituraPainel } from "./hermes-painel";

/**
 * Composição de produção do painel do Hermes. A auditoria usa o ator real (o perfil da sessão),
 * ao contrário do hermes-runtime.ts (rotas do agente, ator "sistema").
 */

export const depsLeituraPainel: DepsLeituraPainel = {
  agora: () => new Date(),
  instalacoes: listarInstalacoesBrutas,
  instalacao: instalacaoBruta,
  eventos: eventosHermesDoServidor,
  chavesDaInstalacao,
  versoesAgente: versoesAgentePublicadas,
  async dadosLicenca(clienteId) {
    const [d, cfg] = await Promise.all([dadosLicencaCliente(clienteId), getConfig()]);
    return { ...d, modoPanico: cfg.modoPanico, maxDiasConfianca: cfg.maxDiasConfianca };
  },
  // só `hermes_enforcement`: o `modo_simulacao` global (Credit/Pic Price) NÃO afeta o Hermes
  async configEnforcement() {
    const c = await getConfigHermes();
    return { enforcementAtivo: c.enforcement.ativo, offlineHoras: c.offlineHoras };
  },
  async lerEnforcement() {
    return (await getConfigHermes()).enforcement;
  },
};

export function depsEscritaPainel(perfil: PerfilSessao): DepsEscritaPainel {
  return {
    ...repoEscritaPainel,
    agora: () => new Date(),
    auditar: (a) =>
      registrarAuditoria({ ator: perfil, acao: a.acao, entidade: "hermes", entidadeId: a.entidadeId, detalhes: a.detalhes }),
    lerEnforcement: async () => (await getConfigHermes()).enforcement,
    gravarEnforcement: (enforcement) => setConfigHermes({ enforcement }),
  };
}
