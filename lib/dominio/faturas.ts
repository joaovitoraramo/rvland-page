import { addMeses, competenciaDe, vencimentoNaCompetencia } from "./tempo";

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

/**
 * Próximo vencimento agendado de um contrato recorrente, derivado da agenda
 * (dia de vencimento) e não das faturas existentes. Resolve o caso "cliente em
 * dia mas a fatura do próximo mês ainda não foi gerada pelo cron": pega o mês
 * seguinte à última competência faturada e avança até cair no futuro.
 */
export function proximoVencimentoAgendado(
  diaVencimento: number,
  competenciasFaturadas: string[],
  hoje: string
): string {
  let base: string;
  if (competenciasFaturadas.length > 0) {
    const ultima = competenciasFaturadas.reduce((a, b) => (a > b ? a : b));
    base = addMeses(ultima, 1);
  } else {
    base = competenciaDe(hoje);
  }

  let vencimento = vencimentoNaCompetencia(base, diaVencimento);
  // nunca no passado (dados velhos ou primeira fatura do mês corrente já vencida)
  while (vencimento <= hoje) {
    base = addMeses(base, 1);
    vencimento = vencimentoNaCompetencia(base, diaVencimento);
  }
  return vencimento;
}
