/**
 * Leitura de `.env` para o gerador de chaves (scripts/gerar-chaves.ts). Pura:
 * sem fs, sem imprimir valores.
 *
 * Uma chave "existe" só com valor (`^NOME=.+`): a linha vazia vinda de uma
 * cópia do .env.example NÃO conta, senão o script "mantém" uma chave que não existe.
 */

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** O valor, sem aspas e sem espaços das pontas; "" se a chave não está (ou está comentada). */
function valorDe(env: string, nome: string): string {
  const m = new RegExp(`^${escapar(nome)}=([^\\r\\n]*)`, "m").exec(env);
  if (!m) return "";
  return m[1].trim().replace(/^(["'])(.*)\1$/, "$2").trim();
}

export function temValorNoEnv(env: string, nome: string): boolean {
  return valorDe(env, nome) !== "";
}

/** Remove as linhas `NOME=` SEM valor (o bloco gerado é anexado depois; evita chave duplicada). */
export function removerChavesVazias(env: string, nomes: string[]): string {
  return env
    .split("\n")
    .filter((linha) => !nomes.some((n) => new RegExp(`^${escapar(n)}=(\\s*|""|'')\\r?$`).test(linha)))
    .join("\n");
}
