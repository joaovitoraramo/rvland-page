import "server-only";
import { and, desc, eq } from "drizzle-orm";

import { db, agenteReleases } from "@/lib/db";

/** Versão da última release estável (independente de arquitetura). Null se não há. */
export async function ultimaVersaoEstavel(): Promise<string | null> {
  const [r] = await db
    .select({ versao: agenteReleases.versao })
    .from(agenteReleases)
    .where(and(eq(agenteReleases.canal, "estavel"), eq(agenteReleases.ativo, true)))
    .orderBy(desc(agenteReleases.criadoEm))
    .limit(1);
  return r?.versao ?? null;
}

/**
 * Resolve uma release por versão+arch. "latest" pega a mais recente e ativa do
 * canal estável para aquela arquitetura.
 */
export async function resolverRelease(versao: string, arch: string) {
  if (versao === "latest") {
    const [r] = await db
      .select()
      .from(agenteReleases)
      .where(
        and(
          eq(agenteReleases.arch, arch as "amd64" | "arm64"),
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
    .where(
      and(eq(agenteReleases.versao, versao), eq(agenteReleases.arch, arch as "amd64" | "arm64"))
    )
    .limit(1);
  return r ?? null;
}
