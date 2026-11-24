/**
 * Rate limit simples por chave e janela fixa (tabela hermes_limites).
 * O repositório SQL faz o incremento atômico (INSERT ... ON CONFLICT DO UPDATE
 * ... RETURNING); aqui só a regra.
 */

export interface RepoLimites {
  /** Soma 1 à (chave, janela) e devolve a contagem resultante. */
  incrementar(chave: string, janela: Date): Promise<number>;
  ler(chave: string, janela: Date): Promise<number>;
}

export function janelaDe(agora: Date, janelaMs: number): Date {
  return new Date(Math.floor(agora.getTime() / janelaMs) * janelaMs);
}

/** Conta uma requisição e diz se ainda cabe no máximo. */
export async function consumirLimite(
  repo: RepoLimites,
  chave: string,
  max: number,
  janelaMs: number,
  agora: Date
): Promise<{ permitido: boolean; contagem: number; max: number }> {
  const contagem = await repo.incrementar(chave, janelaDe(agora, janelaMs));
  return { permitido: contagem <= max, contagem, max };
}

/** Só olha (não conta): para limites de FALHAS, contadas à parte. */
export async function excedeuLimite(
  repo: RepoLimites,
  chave: string,
  max: number,
  janelaMs: number,
  agora: Date
): Promise<boolean> {
  return (await repo.ler(chave, janelaDe(agora, janelaMs))) >= max;
}

export async function registrarOcorrencia(
  repo: RepoLimites,
  chave: string,
  janelaMs: number,
  agora: Date
): Promise<number> {
  return repo.incrementar(chave, janelaDe(agora, janelaMs));
}

export const UMA_HORA_MS = 3600_000;
