import { addDias } from "./tempo";
import type { ResultadoLicenca } from "./licenca";

/**
 * Monta o payload do lease (licença assinada) que o agente recebe a cada
 * heartbeat. É a tradução do status de licença (domínio da Fase 1) para uma
 * instrução temporal que o agente consegue aplicar mesmo offline:
 *
 *   opera os serviços licenciados até `operar_ate`; depois, se o status manda
 *   bloquear e não há simulação/pânico, para os serviços.
 *
 * A assinatura Ed25519 é aplicada fora daqui (camada que tem a chave privada).
 */

export type EntradaLease = {
  servidorId: string;
  clienteId: string;
  hoje: string; // "YYYY-MM-DD" (SP)
  licenca: ResultadoLicenca;
  servicosLicenciados: string[];
  modoSimulacao: boolean;
  modoPanico: boolean;
  emitidoEm?: Date;
  renovarAposHoras?: number;
};

export type LeasePayload = {
  v: 1;
  servidor_id: string;
  cliente_id: string;
  emitido_em: string;
  status: ResultadoLicenca["status"];
  operar_ate: string;
  renovar_apos: string;
  servicos_licenciados: string[];
  modo_simulacao: boolean;
  panico: boolean;
};

// 03:00 America/Sao_Paulo (UTC-3) = 06:00 UTC — janela de corte de madrugada
const HORA_CORTE_UTC = "T06:00:00.000Z";
// futuro distante para casos sem enforcement (sem_licenca / pânico)
const FUTURO_DISTANTE = "2099-01-01T00:00:00.000Z";

function operarAte(hoje: string, licenca: ResultadoLicenca): string {
  switch (licenca.status) {
    case "em_dia":
      // opera até a madrugada seguinte ao fim da tolerância do próximo
      // vencimento (mesma regra do atrasado) — outage-safe e renovado a cada dia
      return licenca.toleradoAte
        ? `${addDias(licenca.toleradoAte, 1)}${HORA_CORTE_UTC}`
        : FUTURO_DISTANTE;
    case "atrasado":
      // último dia tolerado roda inteiro; corta 03:00 SP da manhã seguinte
      return licenca.toleradoAte
        ? `${addDias(licenca.toleradoAte, 1)}${HORA_CORTE_UTC}`
        : `${hoje}${HORA_CORTE_UTC}`;
    case "sem_licenca":
      // servidor sem contrato recorrente: agente não força nada
      return FUTURO_DISTANTE;
    case "bloqueado":
    case "cancelado":
      // corta já: ontem às 03:00 (instante no passado)
      return `${addDias(hoje, -1)}${HORA_CORTE_UTC}`;
  }
}

export function montarLease(e: EntradaLease): LeasePayload {
  const emitido = e.emitidoEm ?? new Date();
  const renovarApos = new Date(
    emitido.getTime() + (e.renovarAposHoras ?? 12) * 60 * 60 * 1000
  );

  // pânico e sem_licenca nunca resultam em corte
  const operar =
    e.modoPanico || e.licenca.status === "sem_licenca"
      ? FUTURO_DISTANTE
      : operarAte(e.hoje, e.licenca);

  return {
    v: 1,
    servidor_id: e.servidorId,
    cliente_id: e.clienteId,
    emitido_em: emitido.toISOString(),
    status: e.licenca.status,
    operar_ate: operar,
    renovar_apos: renovarApos.toISOString(),
    servicos_licenciados: e.servicosLicenciados,
    modo_simulacao: e.modoSimulacao,
    panico: e.modoPanico,
  };
}
