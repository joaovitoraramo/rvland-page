import { compararDatas } from "@/lib/dominio/tempo";
import { diaLicenca, type OrigemHermes, type ResultadoHermes, type StatusHermes } from "./licenca";

/**
 * Documento de licença do Hermes (conteúdo que é assinado em
 * lib/crypto/hermes.ts e entregue ao agente por POST /api/agente/hermes).
 * `tipo: "hermes_licenca"` separa o domínio: nenhum lease ou autorização do
 * Pic Price vale como documento Hermes.
 *
 * REGRA ÚNICA DO AGENTE (documento já validado: assinatura, servidor_id,
 * instalacao_id, emitido_em crescente, relógio confiável):
 *   bloquear  <=>  modo === "valendo" && !panico
 *                  && (bloqueante || agora_confiavel >= offline_ate)
 * `bloqueante` e `panico` vão no documento; o agente não deve inferir bloqueio
 * só pelo `status`. Em simulação nunca bloqueia (só registra a intenção).
 */

export const TIPO_DOCUMENTO_HERMES = "hermes_licenca" as const;
export const KID_HERMES = "h1" as const;

export type CanalHermes = "stable" | "preview";
export type EnforcementInstalacao = "herdar" | "simular";
export type ModoHermes = "valendo" | "simulacao";

export type DocumentoHermes = {
  tipo: typeof TIPO_DOCUMENTO_HERMES;
  v: 1;
  kid: typeof KID_HERMES;
  instalacao_id: string;
  servidor_id: string | null;
  cliente_id: string;
  cnpj: string;
  emitido_em: string;
  status: StatusHermes;
  origem: OrigemHermes;
  expira_em: string | null;
  carencia_ate: string | null;
  operar_ate: string;
  offline_ate: string;
  modo: ModoHermes;
  obrigatoria: boolean;
  canal: CanalHermes;
  aviso: string | null;
  /** Pânico global ativo (afasta o bloqueio de status não manuais). */
  panico: boolean;
  /** Bloqueio explícito (status bloqueante e sem pânico); ver regra do agente no cabeçalho. */
  bloqueante: boolean;
};

export type EntradaDocumento = {
  instalacaoId: string;
  servidorId: string | null;
  clienteId: string;
  cnpj: string;
  canal: CanalHermes;
  licenca: ResultadoHermes;
  /** `hermes_enforcement.ativo` (botão PASSAR A VALER). */
  enforcementAtivo: boolean;
  enforcementInstalacao: EnforcementInstalacao;
  /**
   * Avisa "vence em breve" quando faltam até N dias. Padrão 0 (desligado):
   * decisão do dono — banner só na carência; D-7/D-3 só por Telegram.
   */
  avisarVencimentoDias?: number;
};

/** `valendo` só com enforcement global ativo E instalação sem exceção. */
export function modoDocumento(
  enforcementAtivo: boolean,
  enforcementInstalacao: EnforcementInstalacao
): ModoHermes {
  return enforcementAtivo && enforcementInstalacao === "herdar" ? "valendo" : "simulacao";
}

function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

const AVISO_BLOQUEIO: Partial<Record<StatusHermes, string>> = {
  vencida: "Licença do Hermes vencida. Entre em contato com a RV para regularizar.",
  bloqueada: "Licença do Hermes bloqueada. Entre em contato com a RV.",
  revogada: "Instalação do Hermes revogada. Entre em contato com a RV.",
  sem_contrato: "Licença do Hermes sem contrato vinculado. Entre em contato com a RV.",
  cancelada: "Contrato do Hermes cancelado. Entre em contato com a RV.",
};

/** Texto pt-BR por nível: bloqueio, carência ou (opcional) vencimento próximo. */
export function avisoHermes(l: ResultadoHermes, avisarVencimentoDias = 0): string | null {
  if (l.bloqueante) return AVISO_BLOQUEIO[l.status] ?? null;

  const hoje = diaLicenca(new Date(l.emitido_em));

  if (l.status === "carencia") {
    // em pânico a carência pode já ter passado: sem aviso com data vencida
    if (!l.carencia_ate || compararDatas(l.carencia_ate, hoje) < 0) return null;
    return `Licença do Hermes em carência: regularize o pagamento até ${dataBR(l.carencia_ate)} para evitar o bloqueio.`;
  }

  if (l.status === "ativa" && avisarVencimentoDias > 0 && l.expira_em) {
    const limite = new Date(`${hoje}T00:00:00Z`).getTime() + avisarVencimentoDias * 86400000;
    if (new Date(`${l.expira_em}T00:00:00Z`).getTime() <= limite) {
      return `Licença do Hermes vence em breve (${dataBR(l.expira_em)}).`;
    }
  }
  return null;
}

export function montarDocumentoHermes(e: EntradaDocumento): DocumentoHermes {
  const modo = modoDocumento(e.enforcementAtivo, e.enforcementInstalacao);
  const l = e.licenca;
  return {
    tipo: TIPO_DOCUMENTO_HERMES,
    v: 1,
    kid: KID_HERMES,
    instalacao_id: e.instalacaoId,
    servidor_id: e.servidorId,
    cliente_id: e.clienteId,
    cnpj: e.cnpj,
    emitido_em: l.emitido_em,
    status: l.status,
    origem: l.origem,
    expira_em: l.expira_em,
    carencia_ate: l.carencia_ate,
    operar_ate: l.operar_ate,
    offline_ate: l.offline_ate,
    modo,
    obrigatoria: modo === "valendo",
    canal: e.canal,
    aviso: avisoHermes(l, e.avisarVencimentoDias ?? 0),
    panico: l.panico,
    bloqueante: l.bloqueante,
  };
}
