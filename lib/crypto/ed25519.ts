import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

/**
 * Ed25519 em bytes crus (base64), interoperável com o pacote `crypto/ed25519`
 * do Go (pública = 32 bytes, seed privada = 32 bytes, assinatura = 64 bytes).
 *
 * O Node só monta KeyObject a partir de DER, então prefixamos os cabeçalhos
 * fixos SPKI (pública) e PKCS8 (privada) do Ed25519 aos 32 bytes crus.
 */

const PREFIXO_SPKI = Buffer.from("302a300506032b6570032100", "hex"); // 12 bytes
const PREFIXO_PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex"); // 16 bytes

function publicaDeRaw(raw: Buffer): KeyObject {
  return createPublicKey({
    key: Buffer.concat([PREFIXO_SPKI, raw]),
    format: "der",
    type: "spki",
  });
}

function privadaDeRaw(seed: Buffer): KeyObject {
  return createPrivateKey({
    key: Buffer.concat([PREFIXO_PKCS8, seed]),
    format: "der",
    type: "pkcs8",
  });
}

export function gerarParEd25519(): { publicaB64: string; privadaB64: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  // últimos 32 bytes do DER = chave/seed crua
  const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const priv = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
  return {
    publicaB64: Buffer.from(pub).toString("base64"),
    privadaB64: Buffer.from(priv).toString("base64"),
  };
}

export function assinar(mensagem: string | Buffer, privadaB64: string): string {
  const msg = typeof mensagem === "string" ? Buffer.from(mensagem, "utf8") : mensagem;
  const seed = Buffer.from(privadaB64, "base64");
  const assinatura = sign(null, msg, privadaDeRaw(seed));
  return assinatura.toString("base64");
}

export function verificar(
  mensagem: string | Buffer,
  assinaturaB64: string,
  publicaB64: string
): boolean {
  try {
    const msg = typeof mensagem === "string" ? Buffer.from(mensagem, "utf8") : mensagem;
    const sig = Buffer.from(assinaturaB64, "base64");
    if (sig.length !== 64) return false;
    const pub = Buffer.from(publicaB64, "base64");
    if (pub.length !== 32) return false;
    return verify(null, msg, publicaDeRaw(pub), sig);
  } catch {
    return false;
  }
}
