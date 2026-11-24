/**
 * Valores da configuração do Hermes (tabela `configuracoes`), funções PURAS.
 * O `modo_simulacao` global NÃO afeta o Hermes: só `hermes_enforcement` liga o
 * bloqueio (botão PASSAR A VALER).
 *
 *  hermes_enforcement   {ativo, ligado_em, ligado_por, motivo}  (padrão ativo:false)
 *  hermes_offline_horas {horas}                                  (padrão 72)
 *  hermes_avisos        livre (estado dos avisos por Telegram)
 */

export type EnforcementHermes = {
  ativo: boolean;
  ligado_em: string | null;
  ligado_por: string | null;
  motivo: string | null;
};

export type ConfigHermes = {
  enforcement: EnforcementHermes;
  offlineHoras: number;
  avisos: Record<string, unknown>;
};

export const OFFLINE_HORAS_CONFIG_PADRAO = 72;
export const OFFLINE_HORAS_MAX = 720;

export const CHAVES_CONFIG_HERMES = ["hermes_enforcement", "hermes_offline_horas", "hermes_avisos"] as const;

type Mapa = Partial<Record<string, Record<string, unknown> | undefined>>;

const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function parseConfigHermes(mapa: Mapa): ConfigHermes {
  const e = mapa.hermes_enforcement ?? {};
  const h = (mapa.hermes_offline_horas ?? {}).horas;
  const a = mapa.hermes_avisos;
  const horas =
    typeof h === "number" && Number.isFinite(h)
      ? Math.max(0, Math.min(OFFLINE_HORAS_MAX, Math.trunc(h)))
      : OFFLINE_HORAS_CONFIG_PADRAO;
  return {
    enforcement: {
      ativo: e.ativo === true,
      ligado_em: texto(e.ligado_em),
      ligado_por: texto(e.ligado_por),
      motivo: texto(e.motivo),
    },
    offlineHoras: horas,
    avisos: a && typeof a === "object" && !Array.isArray(a) ? a : {},
  };
}

export function montarEnforcement(
  entrada: { ativo: boolean; por: string; motivo?: string | null },
  agora: Date = new Date()
): EnforcementHermes {
  return {
    ativo: entrada.ativo,
    ligado_em: agora.toISOString(),
    ligado_por: entrada.por,
    motivo: entrada.motivo ?? null,
  };
}
