import { licencaHermes, type ResultadoHermes } from "@/lib/hermes/licenca";
import { montarDocumentoHermes, type DocumentoHermes, type ModoHermes } from "@/lib/hermes/documento";
import type { ConfigEnforcement, DadosLicenca, InstalacaoHermes } from "./hermes-tipos";

export interface DepsLicenca {
  dadosLicenca(clienteId: string): Promise<DadosLicenca>;
  configEnforcement(): Promise<ConfigEnforcement>;
}

/**
 * Deriva licença + documento (não assinado) de uma instalação: contrato Hermes
 * vinculado, faturas, `hermes_licencas` e enforcement. O `modo_simulacao` global
 * (Credit/Pic Price) NÃO entra: só `hermes_enforcement` e a exceção da instalação.
 */
export async function derivarDocumento(
  instalacao: InstalacaoHermes,
  agora: Date,
  deps: DepsLicenca
): Promise<{ licenca: ResultadoHermes; documento: DocumentoHermes; modo: ModoHermes }> {
  const [dados, cfg] = await Promise.all([deps.dadosLicenca(instalacao.clienteId), deps.configEnforcement()]);
  const hl = dados.hermesLicenca;

  const licenca = licencaHermes({
    agora,
    instalacaoRevogada: instalacao.status === "revogada",
    bloqueioManual: hl?.bloqueioManual ?? false,
    independeFinanceiro: hl?.independeFinanceiro ?? false,
    renovacaoDias: hl?.renovacaoDias ?? 30,
    contrato: dados.contrato,
    diasConfianca: hl?.diasConfianca ?? 0,
    maxDiasConfianca: dados.maxDiasConfianca,
    modoPanico: dados.modoPanico,
    offlineHoras: cfg.offlineHoras,
  });

  const documento = montarDocumentoHermes({
    instalacaoId: instalacao.id,
    servidorId: instalacao.servidorId,
    clienteId: instalacao.clienteId,
    cnpj: instalacao.cnpj ?? "",
    canal: instalacao.canal,
    licenca,
    enforcementAtivo: cfg.enforcementAtivo,
    enforcementInstalacao: instalacao.enforcement,
  });

  return { licenca, documento, modo: documento.modo };
}
