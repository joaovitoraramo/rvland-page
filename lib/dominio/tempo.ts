/**
 * Datas de negócio da plataforma.
 *
 * Todas as regras trabalham com strings "YYYY-MM-DD" (data civil) no fuso
 * America/Sao_Paulo. O Brasil aboliu o horário de verão em 2019, então o
 * offset é UTC-3 fixo — por isso não há dependência de biblioteca de fuso.
 */

const OFFSET_SP_MS = 3 * 60 * 60 * 1000;

/** Data civil de São Paulo para um instante (default: agora). */
export function hojeSP(agora: Date = new Date()): string {
  const deslocado = new Date(agora.getTime() - OFFSET_SP_MS);
  return deslocado.toISOString().slice(0, 10);
}

/** Normaliza uma data para a competência (dia 1º do mês). */
export function competenciaDe(dataISO: string): string {
  return `${dataISO.slice(0, 7)}-01`;
}

export function competenciaAtual(agora: Date = new Date()): string {
  return competenciaDe(hojeSP(agora));
}

/** Vencimento de uma competência no dia configurado do contrato (1–28). */
export function vencimentoNaCompetencia(competencia: string, dia: number): string {
  return `${competencia.slice(0, 7)}-${String(dia).padStart(2, "0")}`;
}

export function addDias(dataISO: string, dias: number): string {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** < 0 se a antes de b; 0 se iguais; > 0 se a depois de b. */
export function compararDatas(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function formatarDataBR(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function formatarCompetenciaBR(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}
