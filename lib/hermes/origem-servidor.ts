/**
 * Origem do servidor Hermes, SEM coluna nova em `servidores`.
 *
 * Servidor criado pela ativação Hermes (chave de instalação) nasce junto de uma
 * instalação com `hermes_instalacoes.criado_por = 'chave:<prefixo>'` (mesma transação).
 * Esse é o marcador: uma chave/servidor do Hermes NÃO habilita nada do Credit nem
 * do Pic Price (heartbeat, lease, picprice/autorizar recusam como "desconhecido").
 *
 * Adoção NÃO marca: o servidor adotado já existia como servidor normal do Credit
 * e a instalação dele não é criada por chave.
 */
export const PREFIXO_CRIADOR_CHAVE = "chave:";

/** Valor de `hermes_instalacoes.criado_por` para a instalação criada por uma chave. */
export const criadoPorChave = (prefixoChave: string): string => `${PREFIXO_CRIADOR_CHAVE}${prefixoChave}`;

export const foiCriadaPorChave = (criadoPor: string | null | undefined): boolean =>
  typeof criadoPor === "string" && criadoPor.startsWith(PREFIXO_CRIADOR_CHAVE);
