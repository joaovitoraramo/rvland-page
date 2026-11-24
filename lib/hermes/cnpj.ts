/** CNPJ: só dígitos, dígito verificador e raiz (8). Puro. */

export const soDigitosCnpj = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");

export const raizCnpj = (s: string | null | undefined): string => soDigitosCnpj(s).slice(0, 8);

function dv(base: string): number {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** 14 dígitos (máscara tolerada), não repetidos, com os dois dígitos verificadores corretos. */
export function cnpjValido(entrada: string | null | undefined): boolean {
  if (typeof entrada !== "string") return false;
  const d = soDigitosCnpj(entrada);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const d1 = dv(d.slice(0, 12));
  const d2 = dv(d.slice(0, 12) + d1);
  return d === d.slice(0, 12) + String(d1) + String(d2);
}

/** Matriz e filiais compartilham a raiz de 8 dígitos. Raiz vazia nunca casa. */
export function cnpjsMesmaRaiz(a: string | null | undefined, b: string | null | undefined): boolean {
  const ra = raizCnpj(a);
  const rb = raizCnpj(b);
  return ra.length === 8 && ra === rb;
}

/** "11.222.333/****-**": revela só a raiz. */
export function mascararCnpjRaiz(cnpj: string): string {
  const r = raizCnpj(cnpj);
  return `${r.slice(0, 2)}.${r.slice(2, 5)}.${r.slice(5, 8)}/****-**`;
}
