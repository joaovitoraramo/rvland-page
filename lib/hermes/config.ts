import "server-only";
import { inArray } from "drizzle-orm";

import { db, configuracoes } from "@/lib/db";
import { setConfig } from "@/lib/config";
import {
  CHAVES_CONFIG_HERMES,
  OFFLINE_HORAS_MAX,
  parseConfigHermes,
  type ConfigHermes,
  type EnforcementHermes,
} from "./config-valores";

export type { ConfigHermes, EnforcementHermes };

/** Lê as 3 chaves do Hermes (sem tocar em `getConfig` do Credit/Pic Price). */
export async function getConfigHermes(): Promise<ConfigHermes> {
  const linhas = await db
    .select()
    .from(configuracoes)
    .where(inArray(configuracoes.chave, [...CHAVES_CONFIG_HERMES]));
  return parseConfigHermes(Object.fromEntries(linhas.map((l) => [l.chave, l.valor])));
}

/** Grava só o que veio (cada chave independente). A auditoria é de quem chama (ação do painel). */
export async function setConfigHermes(parcial: {
  enforcement?: EnforcementHermes;
  offlineHoras?: number;
  avisos?: Record<string, unknown>;
}): Promise<void> {
  if (parcial.enforcement) {
    await setConfig("hermes_enforcement", { ...parcial.enforcement });
  }
  if (parcial.offlineHoras !== undefined) {
    const horas = Math.max(0, Math.min(OFFLINE_HORAS_MAX, Math.trunc(parcial.offlineHoras)));
    await setConfig("hermes_offline_horas", { horas });
  }
  if (parcial.avisos) {
    await setConfig("hermes_avisos", parcial.avisos);
  }
}
