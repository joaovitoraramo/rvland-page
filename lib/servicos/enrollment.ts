import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

import { db, servidores } from "@/lib/db";

/** Token de enrollment de uso único: guardamos só o hash. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const VALIDADE_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * (Re)gera o token de um servidor pendente. Retorna o token cru — mostrado
 * UMA vez no comando de instalação; o banco guarda apenas o hash.
 */
export async function gerarTokenParaServidor(servidorId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db
    .update(servidores)
    .set({
      enrollmentTokenHash: hashToken(token),
      enrollmentExpiraEm: new Date(Date.now() + VALIDADE_MS),
    })
    .where(eq(servidores.id, servidorId));
  return token;
}
