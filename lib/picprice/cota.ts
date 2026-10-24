/**
 * Cota diária de requisições por token do RV Pic Price.
 * O dia é o de São Paulo (America/Sao_Paulo) e zera à meia-noite de lá.
 * Funções puras: o banco faz o incremento atômico (ver servidor.ts).
 */

export const LIMITE_DIARIO_PADRAO = 200;

/** Uso do dia que vai nas respostas da API. */
export type UsoDiario = { usado: number; limite: number; zeraEm: string };

const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "AAAA-MM-DD" do dia em São Paulo. */
export function diaSaoPaulo(agora: Date = new Date()): string {
  return fmtDia.format(agora);
}

/** Offset de São Paulo naquele instante, ex.: "-03:00" (sem horário de verão desde 2019). */
function offsetSaoPaulo(agora: Date): string {
  const nome = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", timeZoneName: "longOffset" })
    .formatToParts(agora)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = nome?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "-03:00";
}

/** Próxima meia-noite de São Paulo, em ISO com offset (ex.: 2026-10-25T00:00:00-03:00). */
export function proximaMeiaNoiteSaoPaulo(agora: Date = new Date()): string {
  const [a, m, d] = diaSaoPaulo(agora).split("-").map(Number);
  const amanha = new Date(Date.UTC(a, m - 1, d + 1));
  const iso = amanha.toISOString().slice(0, 10);
  return `${iso}T00:00:00${offsetSaoPaulo(agora)}`;
}

/**
 * Regra do contador, igual à do UPDATE atômico do banco:
 * dia novo recomeça em 1; mesmo dia soma 1 só se ainda couber no limite.
 */
export function aplicarConsumo(
  atual: { dia: string | null; qtde: number; limite: number },
  hoje: string
): { ok: boolean; dia: string; qtde: number } {
  if (atual.dia !== hoje) return { ok: true, dia: hoje, qtde: 1 };
  if (atual.qtde < atual.limite) return { ok: true, dia: hoje, qtde: atual.qtde + 1 };
  return { ok: false, dia: hoje, qtde: atual.qtde };
}

/** Quanto já foi usado hoje (0 se o último uso foi em outro dia). */
export function usadoHoje(dia: string | null | undefined, qtde: number | null | undefined, hoje: string): number {
  return dia === hoje ? qtde ?? 0 : 0;
}
