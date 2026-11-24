import type { CanalHermes } from "@/lib/hermes/documento";
import type { FingerprintHermes } from "@/lib/hermes/protocolo";

export type ChaveHermes = {
  id: string;
  tipo: "instalacao" | "adocao";
  clienteId: string;
  /** CNPJ do cliente no momento da emissão (snapshot). */
  cnpj: string | null;
  /** Adoção: instalação existente que será adotada. */
  instalacaoId: string | null;
  prefixo: string;
  canalInicial: CanalHermes;
  expiraEm: Date;
  usadaEm: Date | null;
  usadaFingerprint: Record<string, unknown> | null;
  resultadoInstalacaoId: string | null;
  revogadaEm: Date | null;
};

export type DadosSolicitacao = {
  cnpj: string;
  cnpjRaiz: string;
  identificacao: Record<string, unknown> | null;
  fingerprint: Partial<FingerprintHermes>;
  origemIdentificacao: string | null;
  ipOrigem: string | null;
  versaoInstalador: string | null;
  status: "pendente" | "suspeita";
  clienteProvavelId: string | null;
  motivo: string | null;
};

export interface RepoSolicitacoes {
  /**
   * Upsert pelo dedupe (cnpj + machine_id_hash, com coalesce): repete a
   * tentativa em vez de duplicar. `suspeita` promove uma `pendente`.
   */
  upsert(d: DadosSolicitacao): Promise<{ protocolo: string; criada: boolean; tentativas: number }>;
}

export type UsoChave = {
  ip: string | null;
  fingerprint: Record<string, unknown>;
  cnpj: string;
  identificacao: Record<string, unknown> | null;
  origemIdentificacao: string | null;
};

export type ResultadoAtivacao = { chave: ChaveHermes; instalacaoId: string; servidorId: string; canal: CanalHermes };

export interface RepoAtivacao {
  chavePorHash(hash: string): Promise<ChaveHermes | null>;
  clienteBasico(clienteId: string): Promise<{ nome: string; cnpj: string | null } | null>;
  servidorParaAdocao(servidorId: string): Promise<{
    id: string;
    clienteId: string;
    status: string;
    agentePubkey: string | null;
    instalacaoVinculadaId: string | null;
  } | null>;
  instalacaoDoResultado(instalacaoId: string): Promise<{
    id: string;
    servidorId: string | null;
    canal: CanalHermes;
    servidorStatus: string | null;
  } | null>;
  /**
   * ATÔMICO e em UMA transação: consome a chave (`UPDATE hermes_chaves SET usada_em=now(), ...
   * WHERE token_hash=$1 AND usada_em IS NULL AND revogada_em IS NULL AND expira_em>now()
   * RETURNING *`), cria servidor pendente + instalação e registra o resultado na chave.
   * null = a chave não estava mais utilizável (quem perdeu a corrida).
   */
  ativarInstalar(hash: string, agora: Date, uso: UsoChave): Promise<ResultadoAtivacao | null>;
  /** Idem para adoção: vincula o servidor ativo à instalação da chave; null = não consumida. */
  ativarAdotar(hash: string, agora: Date, uso: UsoChave, servidorId: string): Promise<ResultadoAtivacao | null>;
}
