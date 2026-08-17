import { createHash } from "node:crypto";
import { verificar } from "./ed25519";

/**
 * Autenticação de heartbeat: o agente assina `timestamp + "." + sha256(body)`
 * com sua chave privada. A plataforma confere contra a pública guardada e
 * exige frescor no timestamp (janela contra replay).
 */

const JANELA_MS = 5 * 60 * 1000; // ±5 min

export function mensagemAssinada(timestamp: string, rawBody: string): string {
  const hash = createHash("sha256").update(rawBody, "utf8").digest("hex");
  return `${timestamp}.${hash}`;
}

export function timestampFresco(timestamp: string, agora: number = Date.now()): boolean {
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return false;
  return Math.abs(agora - t) <= JANELA_MS;
}

export function verificarHeartbeat(params: {
  pubkeyB64: string;
  timestamp: string;
  rawBody: string;
  assinaturaB64: string;
  agora?: number;
}): boolean {
  if (!timestampFresco(params.timestamp, params.agora)) return false;
  return verificar(
    mensagemAssinada(params.timestamp, params.rawBody),
    params.assinaturaB64,
    params.pubkeyB64
  );
}
