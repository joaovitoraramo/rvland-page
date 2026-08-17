import { competenciaDe, vencimentoNaCompetencia } from "./tempo";

/**
 * Decisão de geração de fatura mensal (cron).
 * Só contratos recorrentes ativos, com dia de vencimento, sem fatura na
 * competência, e cuja competência não anteceda o mês de início do contrato.
 */

type ContratoParaFatura = {
  tipo: string;
  status: string;
  inicio: string;
  diaVencimento: number | null;
};

export function deveGerarFatura(
  contrato: ContratoParaFatura,
  competencia: string,
  jaExiste: boolean
): boolean {
  if (jaExiste) return false;
  if (contrato.tipo !== "recorrente") return false;
  if (contrato.status !== "ativo") return false;
  if (!contrato.diaVencimento) return false;
  if (competencia < competenciaDe(contrato.inicio)) return false;
  return true;
}

export function montarFatura(
  contrato: Pick<ContratoParaFatura, "diaVencimento">,
  competencia: string,
  valorCentavos: number
): { competencia: string; vencimento: string; valorCentavos: number } {
  return {
    competencia,
    vencimento: vencimentoNaCompetencia(competencia, contrato.diaVencimento ?? 1),
    valorCentavos,
  };
}
