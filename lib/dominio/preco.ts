/**
 * Resolução de preço por competência.
 *
 * Vigências nunca são editadas nem apagadas: mudar o preço é criar uma nova
 * vigência a partir de uma competência futura. O valor de uma fatura é o da
 * vigência mais recente cujo `vigenteDesde` já alcançou a competência.
 */
export function precoVigente(
  vigencias: { valorCentavos: number; vigenteDesde: string }[],
  competencia: string
): number | null {
  let melhor: { valorCentavos: number; vigenteDesde: string } | null = null;

  for (const v of vigencias) {
    if (v.vigenteDesde > competencia) continue;
    if (!melhor || v.vigenteDesde > melhor.vigenteDesde) melhor = v;
  }

  return melhor?.valorCentavos ?? null;
}
