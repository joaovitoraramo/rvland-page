import { addDias, compararDatas } from "./tempo";

/**
 * Máquina de estados da licença (seção 6 do spec).
 *
 * Em dia / Atrasado derivam das faturas; Cancelado / Bloqueado-manual são
 * atos deliberados. Faturas históricas nunca participam. O pânico global
 * impede bloqueio por atraso, mas não anula bloqueio manual.
 */

export type EntradaLicenca = {
  hoje: string;
  contratosRecorrentesAtivos: number;
  tinhaContratoRecorrente: boolean;
  faturasAbertas: {
    vencimento: string;
    toleranciaDias: number;
    historica: boolean;
  }[];
  diasConfianca: number;
  bloqueioManual: boolean;
  modoPanico: boolean;
  /** Próximo vencimento agendado do contrato (quando a fatura ainda não existe). */
  proximoAgendado?: { vencimento: string; toleranciaDias: number };
};

export type StatusLicenca = "em_dia" | "atrasado" | "bloqueado" | "cancelado" | "sem_licenca";

export type ResultadoLicenca = {
  status: StatusLicenca;
  /** Vencimento da próxima fatura aberta (informativo). */
  venceEm: string | null;
  /** Último dia tolerado da fatura vencida mais antiga. */
  toleradoAte: string | null;
};

export function statusLicenca(e: EntradaLicenca): ResultadoLicenca {
  // 1. Cliente sem licenciamento (só contratos fechados, ou nenhum)
  if (e.contratosRecorrentesAtivos === 0 && !e.tinhaContratoRecorrente) {
    return { status: "sem_licenca", venceEm: null, toleradoAte: null };
  }

  // 2. Bloqueio manual vence tudo (inclusive pânico)
  if (e.bloqueioManual) {
    return { status: "bloqueado", venceEm: null, toleradoAte: null };
  }

  // 3. Teve recorrente e todos encerrados → contrato rompido
  if (e.contratosRecorrentesAtivos === 0) {
    return { status: "cancelado", venceEm: null, toleradoAte: null };
  }

  const relevantes = e.faturasAbertas.filter((f) => !f.historica);
  const vencidas = relevantes
    .filter((f) => compararDatas(f.vencimento, e.hoje) < 0)
    .sort((a, b) => compararDatas(a.vencimento, b.vencimento));

  const proxima = relevantes
    .filter((f) => compararDatas(f.vencimento, e.hoje) >= 0)
    .sort((a, b) => compararDatas(a.vencimento, b.vencimento))[0];

  // 4. Nada vencido → em dia. Referência: próxima fatura aberta OU, se ela ainda
  // não foi gerada, o próximo vencimento agendado do contrato.
  if (vencidas.length === 0) {
    const refVenc = proxima?.vencimento ?? e.proximoAgendado?.vencimento ?? null;
    const refTol = proxima?.toleranciaDias ?? e.proximoAgendado?.toleranciaDias ?? 0;
    const toleradoAte = refVenc ? addDias(refVenc, refTol + e.diasConfianca) : null;
    return { status: "em_dia", venceEm: refVenc, toleradoAte };
  }

  const venceEm = proxima?.vencimento ?? null;

  // Referência: a vencida mais antiga
  const referencia = vencidas[0];
  const toleradoAte = addDias(
    referencia.vencimento,
    referencia.toleranciaDias + e.diasConfianca
  );

  // 5. Dentro da janela (tolerância + confiança) → atrasado
  if (compararDatas(e.hoje, toleradoAte) <= 0) {
    return { status: "atrasado", venceEm, toleradoAte };
  }

  // 6. Pânico: nunca bloquear por atraso
  if (e.modoPanico) {
    return { status: "atrasado", venceEm, toleradoAte };
  }

  // 7. Estourou → bloqueado
  return { status: "bloqueado", venceEm, toleradoAte };
}
