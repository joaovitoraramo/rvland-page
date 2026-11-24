import type { ContratoHermes } from "@/lib/hermes/licenca";
import type { CanalHermes, EnforcementInstalacao } from "@/lib/hermes/documento";

/** Tipos compartilhados dos serviços do Hermes (sem dependência de banco/Next). */

export type StatusInstalacao = "aguardando_ativacao" | "ativa" | "revogada" | "desinstalada";

export type InstalacaoHermes = {
  id: string;
  clienteId: string;
  servidorId: string | null;
  nome: string;
  cnpj: string | null;
  status: StatusInstalacao;
  canal: CanalHermes;
  enforcement: EnforcementInstalacao;
  versao: string | null;
  sha: string | null;
  digest: string | null;
  canalEmUso: string | null;
  saude: Record<string, unknown> | null;
  fingerprint: Record<string, unknown> | null;
  ultimoTsAgente: Date | null;
  cloneSuspeitoEm: Date | null;
  ativadaEm: Date | null;
};

export type ServidorAgente = {
  id: string;
  clienteId: string;
  agentePubkey: string | null;
};

/** Estado reportado pelo agente. `status`/`ativadaEm` NÃO entram aqui: só a promoção condicional os muda. */
export type PatchInstalacao = Partial<{
  versao: string | null;
  sha: string | null;
  digest: string | null;
  canalEmUso: string | null;
  saude: Record<string, unknown>;
  fingerprint: Record<string, unknown>;
  relogioOffsetMs: number;
  cloneSuspeitoEm: Date;
  ultimoDocEmitidoEm: Date;
  ultimoEstadoEm: Date;
}>;

export type EventoNovo = {
  tipo: string;
  severidade: "info" | "aviso" | "critico";
  mensagem: string;
  dados: Record<string, unknown> | null;
};

/** Linha de `hermes_licencas` + dados globais, já reduzidos ao que a regra precisa. */
export type DadosLicenca = {
  hermesLicenca: {
    independeFinanceiro: boolean;
    renovacaoDias: number;
    bloqueioManual: boolean;
    diasConfianca: number;
  } | null;
  /** Contrato Hermes vinculado (com faturas abertas) ou null. */
  contrato: ContratoHermes | null;
  modoPanico: boolean;
  maxDiasConfianca: number;
};

export type ConfigEnforcement = { enforcementAtivo: boolean; offlineHoras: number };

export type EntradaAuditoria = {
  acao: string;
  entidadeId?: string;
  detalhes?: Record<string, unknown>;
};

/** Efeitos colaterais "melhor esforço": as implementações nunca lançam. */
export interface DepsEfeitos {
  agora(): Date;
  auditar(a: EntradaAuditoria): Promise<void>;
  telegram(texto: string): Promise<boolean>;
}
