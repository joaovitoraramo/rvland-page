import { createHash } from "node:crypto";

import { assinar, verificar } from "@/lib/crypto/ed25519";

/**
 * Autenticação das rotas do agente do HERMES (domínio PRÓPRIO, não reutiliza o
 * esquema do heartbeat do Credit; só a primitiva Ed25519 de lib/crypto/ed25519).
 *
 * CONTRATO (o agente Go implementa exatamente isto; ver docs/hermes-protocolo-agente.md):
 *
 *   Rotas (POST, corpo JSON):
 *     sync        → /api/agente/hermes
 *     credencial  → /api/agente/hermes/credencial
 *     ativacao    → POST /api/hermes/ativacao, SÓ a prova de adoção (`agente_existente`):
 *                   não usa headers; servidor, timestamp e assinatura vão no JSON, e o
 *                   "corpo" assinado é o `instalacao_id` da chave de adoção (a prova
 *                   fica DENTRO do corpo da requisição, então não dá para assinar o corpo todo).
 *
 *   Headers:
 *     X-RVLand-Servidor   : uuid do servidor (agente RV já enrolado)
 *     X-RVLand-Timestamp  : relógio do agente, ISO-8601/RFC 3339 (ex.: 2026-11-23T12:00:00.000Z).
 *                           A string é assinada EXATAMENTE como enviada.
 *     X-RVLand-Assinatura : base64 (64 bytes) da assinatura Ed25519 da MENSAGEM abaixo
 *
 *   Mensagem assinada (UTF-8, sem quebra de linha):
 *     hermes:<rota>:<timestamp>.<sha256_hex(corpo_cru)>
 *   onde <rota> é `sync`, `credencial` ou `ativacao`, <timestamp> é o valor do header e
 *   sha256_hex é o SHA-256 em hexadecimal minúsculo dos bytes UTF-8 do corpo
 *   exatamente como enviado (corpo vazio = hash de "").
 *
 *   Exemplo (sync, corpo `{"a":1}`):
 *     hermes:sync:2026-11-23T12:00:00.000Z.<64 hex>
 *
 *   Por que o prefixo: uma assinatura de sync não vale na credencial (e
 *   vice-versa), e a do heartbeat do Credit (`<timestamp>.<sha256>`) não vale em
 *   nenhuma rota Hermes. Janela de frescor: ±5 min do relógio do servidor.
 */

export type RotaAgenteHermes = "sync" | "credencial" | "ativacao";
export const ROTAS_AGENTE_HERMES: readonly RotaAgenteHermes[] = ["sync", "credencial", "ativacao"];

const JANELA_MS = 5 * 60 * 1000;

export function mensagemHermes(rota: RotaAgenteHermes, timestamp: string, rawBody: string): string {
  if (!ROTAS_AGENTE_HERMES.includes(rota)) throw new Error("rota Hermes desconhecida");
  const hash = createHash("sha256").update(rawBody, "utf8").digest("hex");
  return `hermes:${rota}:${timestamp}.${hash}`;
}

export function timestampFrescoHermes(timestamp: string, agoraMs: number): boolean {
  const t = Date.parse(timestamp);
  return !Number.isNaN(t) && Math.abs(agoraMs - t) <= JANELA_MS;
}

/** Lado do agente (usado pelos testes e pelo mundo em memória; o agente Go faz o equivalente). */
export function assinarPedidoHermes(rota: RotaAgenteHermes, timestamp: string, rawBody: string, privadaB64: string): string {
  return assinar(mensagemHermes(rota, timestamp, rawBody), privadaB64);
}

/**
 * Confere SÓ a assinatura (o frescor é checado à parte, para o servidor poder
 * distinguir "relógio errado" de "não autenticado": o 409 RELOGIO só sai para
 * quem provou possuir a chave).
 */
export function verificarPedidoHermes(p: {
  rota: RotaAgenteHermes;
  pubkeyB64: string;
  timestamp: string;
  rawBody: string;
  assinaturaB64: string;
}): boolean {
  if (!ROTAS_AGENTE_HERMES.includes(p.rota)) return false;
  return verificar(mensagemHermes(p.rota, p.timestamp, p.rawBody), p.assinaturaB64, p.pubkeyB64);
}
