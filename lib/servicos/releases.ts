import "server-only";
import { and, desc, eq } from "drizzle-orm";

import { db, agenteReleases } from "@/lib/db";
import type { SistemaServidor } from "@/lib/dominio/servidor-so";

/**
 * Versão da última release estável de um SO (independente de arquitetura).
 * O padrão é linux, para os agentes antigos que não informam o SO.
 */
export async function ultimaVersaoEstavel(so: SistemaServidor = "linux"): Promise<string | null> {
  const [r] = await db
    .select({ versao: agenteReleases.versao })
    .from(agenteReleases)
    .where(and(eq(agenteReleases.canal, "estavel"), eq(agenteReleases.ativo, true), eq(agenteReleases.so, so)))
    .orderBy(desc(agenteReleases.criadoEm))
    .limit(1);
  return r?.versao ?? null;
}

/**
 * Resolve uma release por versão+arch+SO. "latest" pega a mais recente e ativa
 * do canal estável para aquela arquitetura e SO.
 */
export async function resolverRelease(versao: string, arch: string, so: SistemaServidor = "linux") {
  const archOk = arch as "amd64" | "arm64";
  if (versao === "latest") {
    const [r] = await db
      .select()
      .from(agenteReleases)
      .where(
        and(
          eq(agenteReleases.arch, archOk),
          eq(agenteReleases.so, so),
          eq(agenteReleases.canal, "estavel"),
          eq(agenteReleases.ativo, true)
        )
      )
      .orderBy(desc(agenteReleases.criadoEm))
      .limit(1);
    return r ?? null;
  }
  const [r] = await db
    .select()
    .from(agenteReleases)
    .where(and(eq(agenteReleases.versao, versao), eq(agenteReleases.arch, archOk), eq(agenteReleases.so, so)))
    .limit(1);
  return r ?? null;
}
