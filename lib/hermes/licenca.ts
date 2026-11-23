import { statusLicenca, type EntradaLicenca } from "@/lib/dominio/licenca";
import { addDias, compararDatas, hojeSP } from "@/lib/dominio/tempo";

/**
 * Licença do Hermes (Fase 2). Função PURA: traduz contrato/faturas da RV
 * (mesmo motor do Credit, `statusLicenca`, usado sem modificação e só com o
 * contrato Hermes vinculado) + exceções do painel em datas que o agente aplica
 * mesmo offline. A assinatura é feita fora (lib/crypto/hermes.ts).
 *
 * Precedência: instalação revogada > bloqueio manual > independe_financeiro >
 * sem contrato > contrato/faturas. Pânico global afasta o bloqueio de qualquer
 * status que não seja revogada/bloqueio manual (operar_ate = 2099).
 *
 * "Dia de licença": vira às 03:00 de São Paulo (06:00Z), não à meia-noite. O
 * último dia tolerado roda inteiro e o status só passa a vencida no mesmo
 * instante de `operar_ate` (06:00Z do dia seguinte), coerente com o lease.
 *
 * Limites conhecidos (a validar nas etapas seguintes, NÃO garantidos aqui):
 *  - Contrato ativo sem fatura aberta nem agendamento vira janela rolante
 *    silenciosa (hoje + renovacao_dias): o painel/Telegram devem alertar (P12).
 *  - A função NÃO garante tolerância 3 nem que o contrato seja recorrente e do
 *    mesmo cliente: exigir ao vincular o contrato (P3/P12).
 *  - Instalação `aguardando_ativacao`/`desinstalada` não entra aqui: só
 *    `revogada` (instalacaoRevogada); os demais estados são tratados pela rota.
 */

export type StatusHermes =
  | "ativa"
  | "carencia"
  | "vencida"
  | "bloqueada"
  | "revogada"
  | "sem_contrato"
  | "cancelada";

export type OrigemHermes =
  | "contrato"
  | "independente"
  | "bloqueio_manual"
  | "instalacao_revogada"
  | "sem_contrato";

export type ContratoHermes = {
  /** contrato.status === "ativo" (encerrado → cancelada). */
  ativo: boolean;
  faturasAbertas: EntradaLicenca["faturasAbertas"];
  /** Próximo vencimento agendado quando a fatura ainda não existe. */
  proximoAgendado?: EntradaLicenca["proximoAgendado"];
};

export type EntradaLicencaHermes = {
  /** Instante da emissão (vira `emitido_em`; a data civil é a de São Paulo). */
  agora: Date;
  instalacaoRevogada: boolean;
  bloqueioManual: boolean;
  independeFinanceiro: boolean;
  /** Janela rolante do `independe_financeiro` (dias a partir de hoje). */
  renovacaoDias: number;
  /** Contrato Hermes vinculado, ou null. */
  contrato: ContratoHermes | null;
  diasConfianca: number;
  /** Teto da confiança (configuração `max_dias_confianca`). Padrão 7. */
  maxDiasConfianca?: number;
  modoPanico: boolean;
  /** Horas offline extras após `operar_ate`. Padrão 72. */
  offlineHoras?: number;
};

export type ResultadoHermes = {
  status: StatusHermes;
  origem: OrigemHermes;
  emitido_em: string;
  /** Data civil (YYYY-MM-DD) ou null quando não se aplica. */
  expira_em: string | null;
  /** Último dia tolerado (YYYY-MM-DD) ou null. */
  carencia_ate: string | null;
  operar_ate: string;
  offline_ate: string;
  /** Bloqueio explícito (status bloqueante e sem pânico). */
  bloqueante: boolean;
  panico: boolean;
};

export const CARENCIA_PADRAO_DIAS = 3;
export const MAX_DIAS_CONFIANCA_PADRAO = 7;
export const OFFLINE_HORAS_PADRAO = 72;
export const FUTURO_DISTANTE = "2099-01-01T00:00:00.000Z";
// 03:00 America/Sao_Paulo (UTC-3) = 06:00 UTC — mesma regra de lib/dominio/lease.ts
const HORA_CORTE_UTC = "T06:00:00.000Z";

const BLOQUEANTES: ReadonlySet<StatusHermes> = new Set([
  "vencida",
  "bloqueada",
  "revogada",
  "sem_contrato",
  "cancelada",
]);

export function statusBloqueante(status: StatusHermes): boolean {
  return BLOQUEANTES.has(status);
}

type Bruto = {
  status: StatusHermes;
  origem: OrigemHermes;
  expira_em: string | null;
  carencia_ate: string | null;
};

function inteiro(n: number, min: number, max: number): number {
  const v = Number.isFinite(n) ? Math.trunc(n) : min;
  return Math.max(min, Math.min(max, v));
}

export const RENOVACAO_DIAS_MAX = 3650;

/** Data civil de licença: vira às 03:00 SP (06:00Z). */
export function diaLicenca(agora: Date): string {
  return hojeSP(new Date(agora.getTime() - 3 * 3600 * 1000));
}

/** Expiração da janela rolante: hoje + renovacao_dias, limitado a [1, 3650]. */
function janelaRolante(hoje: string, renovacaoDias: number): string {
  return addDias(hoje, inteiro(renovacaoDias, 1, RENOVACAO_DIAS_MAX));
}

function derivarContrato(e: EntradaLicencaHermes, hoje: string, confianca: number): Bruto {
  const c = e.contrato as ContratoHermes;
  const r = statusLicenca({
    hoje,
    contratosRecorrentesAtivos: c.ativo ? 1 : 0,
    tinhaContratoRecorrente: true,
    faturasAbertas: c.faturasAbertas,
    diasConfianca: confianca,
    bloqueioManual: false, // tratado antes, com precedência própria
    modoPanico: e.modoPanico,
    proximoAgendado: c.proximoAgendado,
  });

  switch (r.status) {
    case "em_dia": {
      if (r.venceEm && r.toleradoAte) {
        return { status: "ativa", origem: "contrato", expira_em: r.venceEm, carencia_ate: r.toleradoAte };
      }
      // Contrato ativo sem fatura aberta nem agendamento conhecido: janela rolante
      // limitada (nunca 2099), para a licença continuar expirando se a cobrança travar.
      const expira = janelaRolante(hoje, e.renovacaoDias);
      return {
        status: "ativa",
        origem: "contrato",
        expira_em: expira,
        carencia_ate: addDias(expira, CARENCIA_PADRAO_DIAS + confianca),
      };
    }
    case "atrasado":
    case "bloqueado": {
      const maisAntiga = c.faturasAbertas
        .filter((f) => !f.historica && compararDatas(f.vencimento, hoje) < 0)
        .map((f) => f.vencimento)
        .sort(compararDatas)[0];
      return {
        status: r.status === "atrasado" ? "carencia" : "vencida",
        origem: "contrato",
        expira_em: maisAntiga ?? null,
        carencia_ate: r.toleradoAte,
      };
    }
    case "cancelado":
      return { status: "cancelada", origem: "contrato", expira_em: null, carencia_ate: null };
    case "sem_licenca":
      return { status: "sem_contrato", origem: "sem_contrato", expira_em: null, carencia_ate: null };
  }
}

export function licencaHermes(e: EntradaLicencaHermes): ResultadoHermes {
  const hoje = diaLicenca(e.agora);
  const emitido = e.agora.toISOString();
  const confianca = inteiro(
    e.diasConfianca,
    0,
    inteiro(e.maxDiasConfianca ?? MAX_DIAS_CONFIANCA_PADRAO, 0, 3650)
  );

  let bruto: Bruto;
  if (e.instalacaoRevogada) {
    bruto = { status: "revogada", origem: "instalacao_revogada", expira_em: null, carencia_ate: null };
  } else if (e.bloqueioManual) {
    bruto = { status: "bloqueada", origem: "bloqueio_manual", expira_em: null, carencia_ate: null };
  } else if (e.independeFinanceiro) {
    const expira = janelaRolante(hoje, e.renovacaoDias);
    bruto = {
      status: "ativa",
      origem: "independente",
      expira_em: expira,
      carencia_ate: addDias(expira, CARENCIA_PADRAO_DIAS),
    };
  } else if (!e.contrato) {
    bruto = { status: "sem_contrato", origem: "sem_contrato", expira_em: null, carencia_ate: null };
  } else {
    bruto = derivarContrato(e, hoje, confianca);
  }

  // Revogada e bloqueio manual vencem tudo, inclusive o pânico.
  const manual = bruto.status === "revogada" || bruto.status === "bloqueada";
  const panico = e.modoPanico && !manual;
  const bloqueante = statusBloqueante(bruto.status) && !panico;

  let operar: string;
  let offline: string;
  if (panico) {
    operar = offline = FUTURO_DISTANTE;
  } else if (bloqueante) {
    operar = offline = emitido;
  } else {
    // ativa/carencia sempre têm carencia_ate
    operar = `${addDias(bruto.carencia_ate as string, 1)}${HORA_CORTE_UTC}`;
    const horas = inteiro(e.offlineHoras ?? OFFLINE_HORAS_PADRAO, 0, 24 * 365);
    offline = new Date(Date.parse(operar) + horas * 3600 * 1000).toISOString();
  }

  return {
    status: bruto.status,
    origem: bruto.origem,
    emitido_em: emitido,
    expira_em: bruto.expira_em,
    carencia_ate: bruto.carencia_ate,
    operar_ate: operar,
    offline_ate: offline,
    bloqueante,
    panico,
  };
}
