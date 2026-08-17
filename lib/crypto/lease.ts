import { assinar, verificar } from "./ed25519";
import type { LeasePayload } from "@/lib/dominio/lease";

/**
 * Envelope assinado do lease: o agente recebe { payload, assinatura } e
 * confere a assinatura com a chave pública de licença embutida nele.
 * O payload viaja como base64(JSON) para a assinatura ser byte-exata.
 */

export type LeaseEnvelope = { payload: string; assinatura: string };

function skLicenca(): string {
  const sk = process.env.RVLAND_LICENSE_SK;
  if (!sk) throw new Error("RVLAND_LICENSE_SK não configurada");
  return sk;
}

function pkLicenca(): string {
  const pk = process.env.RVLAND_LICENSE_PK;
  if (!pk) throw new Error("RVLAND_LICENSE_PK não configurada");
  return pk;
}

export function assinarLease(payload: LeasePayload): LeaseEnvelope {
  const bytes = Buffer.from(JSON.stringify(payload), "utf8");
  return {
    payload: bytes.toString("base64"),
    assinatura: assinar(bytes, skLicenca()),
  };
}

/** Verifica e decodifica um envelope. Null se a assinatura não bater. */
export function verificarLease(envelope: LeaseEnvelope): LeasePayload | null {
  const bytes = Buffer.from(envelope.payload, "base64");
  if (!verificar(bytes, envelope.assinatura, pkLicenca())) return null;
  try {
    return JSON.parse(bytes.toString("utf8")) as LeasePayload;
  } catch {
    return null;
  }
}
