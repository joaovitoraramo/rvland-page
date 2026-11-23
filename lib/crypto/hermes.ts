import { assinar, verificar } from "./ed25519";
import {
  KID_HERMES,
  TIPO_DOCUMENTO_HERMES,
  type DocumentoHermes,
} from "@/lib/hermes/documento";

/**
 * Envelope assinado do documento de licença do Hermes: { payload, assinatura, kid }.
 * O payload viaja como base64(JSON) para a assinatura ser byte-exata.
 *
 * Chave PRÓPRIA do Hermes (RVLAND_HERMES_SK/RVLAND_HERMES_PK, kid "h1"), distinta
 * de RVLAND_LICENSE_SK (lease do Credit/Pic Price). Separação de domínio: o
 * verificador só aceita payload com tipo "hermes_licenca" e kid coerente com o
 * envelope; lease e autorização do Pic Price (sem esse tipo) nunca validam aqui.
 * As chaves chegam por parâmetro; os wrappers *Ambiente leem as variáveis só por nome.
 */

export type EnvelopeHermes = { payload: string; assinatura: string; kid: string };

/** kid → chave pública (base64, 32 bytes). */
export type ChavesPublicasHermes = Record<string, string>;

export function assinarDocumentoHermes(doc: DocumentoHermes, privadaB64: string): EnvelopeHermes {
  if (doc.tipo !== TIPO_DOCUMENTO_HERMES) {
    throw new Error(`documento Hermes inválido: tipo ${String(doc.tipo)}`);
  }
  const bytes = Buffer.from(JSON.stringify(doc), "utf8");
  return {
    payload: bytes.toString("base64"),
    assinatura: assinar(bytes, privadaB64),
    kid: doc.kid,
  };
}

/** Verifica e decodifica. Null se kid desconhecido, assinatura inválida ou tipo/kid incoerentes. */
export function verificarDocumentoHermes(
  envelope: EnvelopeHermes,
  chaves: ChavesPublicasHermes
): DocumentoHermes | null {
  try {
    if (!envelope || typeof envelope.payload !== "string" || typeof envelope.assinatura !== "string") {
      return null;
    }
    if (typeof envelope.kid !== "string" || !Object.hasOwn(chaves, envelope.kid)) return null;
    const bytes = Buffer.from(envelope.payload, "base64");
    if (!verificar(bytes, envelope.assinatura, chaves[envelope.kid])) return null;
    const doc = JSON.parse(bytes.toString("utf8")) as DocumentoHermes;
    if (!doc || typeof doc !== "object") return null;
    if (doc.tipo !== TIPO_DOCUMENTO_HERMES || doc.v !== 1) return null;
    if (doc.kid !== envelope.kid) return null;
    return doc;
  } catch {
    return null;
  }
}

function skHermes(): string {
  const sk = process.env.RVLAND_HERMES_SK;
  if (!sk) throw new Error("RVLAND_HERMES_SK não configurada");
  return sk;
}

function pkHermes(): string {
  const pk = process.env.RVLAND_HERMES_PK;
  if (!pk) throw new Error("RVLAND_HERMES_PK não configurada");
  return pk;
}

export function assinarDocumentoHermesAmbiente(doc: DocumentoHermes): EnvelopeHermes {
  const sk = skHermes();
  // separação de chaves: a SK Hermes nunca pode ser a do lease (Credit/Pic Price)
  if (process.env.RVLAND_LICENSE_SK && process.env.RVLAND_LICENSE_SK === sk) {
    throw new Error("RVLAND_HERMES_SK não pode ser igual a RVLAND_LICENSE_SK");
  }
  return assinarDocumentoHermes(doc, sk);
}

export function verificarDocumentoHermesAmbiente(envelope: EnvelopeHermes): DocumentoHermes | null {
  return verificarDocumentoHermes(envelope, { [KID_HERMES]: pkHermes() });
}
