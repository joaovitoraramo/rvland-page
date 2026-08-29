/** Formatação pt-BR compartilhada (server e client). */

export function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** "1.500,00" ou "1500,00" (input humano) → centavos. NaN se inválido. */
export function reaisParaCentavos(texto: string): number {
  const limpo = texto.trim().replace(/[R$\s.]/g, "").replace(",", ".");
  const valor = Number(limpo);
  if (!Number.isFinite(valor)) return NaN;
  return Math.round(valor * 100);
}

export function formatarDataHoraBR(data: Date): string {
  return data.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** USD: "$1,497" quando os centavos são zero; "$79.50" quando não. */
export function formatarDolares(centavos: number): string {
  const semCentavos = centavos % 100 === 0;
  return (centavos / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: semCentavos ? 0 : 2,
    maximumFractionDigits: semCentavos ? 0 : 2,
  });
}

/** "1,497.00" ou "1497" (input humano US) → centavos. NaN se inválido. */
export function dolaresParaCentavos(texto: string): number {
  const limpo = texto.trim().replace(/[$\s,]/g, "");
  if (limpo === "") return NaN;
  const valor = Number(limpo);
  if (!Number.isFinite(valor)) return NaN;
  return Math.round(valor * 100);
}
