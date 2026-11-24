/**
 * Heurística de clone suspeito (imagem/volume copiado para outra máquina com a
 * mesma identidade de agente). Só ALERTA: o dono decide (bloqueio manual no
 * painel); nada de revogação automática.
 *
 * Sinais:
 *  - `boot_alternando`: um boot_id visto nos últimos 10 min reaparece depois de
 *    outro (X, Y, X). Reboot legítimo só avança (X, Y, Z), nunca volta.
 *  - `syncs_excessivos`: mais de 2 syncs dentro de 60 s (o ciclo normal é 1/60 s).
 *  - `machine_id_trocado`: o machine_id_hash reportado mudou ENTRE syncs (o primeiro
 *    sync só registra; não compara com o do instalador, que pode usar outro cálculo).
 *  - `replay_assinado`: REPLAY (timestamp repetido/antigo) de requisição JÁ autenticada,
 *    LIMIAR_REPLAYS vezes em 10 min — quem repete assinaturas costuma ser uma cópia.
 */

export const JANELA_ALTERNANCIA_MS = 10 * 60_000;
export const JANELA_SYNCS_MS = 60_000;
export const MAX_SYNCS_NA_JANELA = 2;
export const LIMIAR_REPLAYS = 3;
const MAX_ITENS = 8;

export type ControleClone = {
  /** Último instante visto de cada boot_id; o último da lista é o atual. */
  boots: { id: string; em: number }[];
  /** Instantes dos últimos syncs (ms). */
  syncs: number[];
  /** Último machine_id_hash reportado pelo agente. */
  machine?: string;
  /** Instantes (ms) dos REPLAYs assinados recentes. */
  replays?: number[];
};

export type SuspeitaClone = "boot_alternando" | "syncs_excessivos" | "machine_id_trocado" | "replay_assinado" | null;

export function avaliarClone(
  anterior: ControleClone | undefined,
  bootId: string | undefined,
  agoraMs: number,
  machineId?: string
): { controle: ControleClone; suspeito: SuspeitaClone } {
  let suspeito: SuspeitaClone = null;

  const machineAnterior = anterior?.machine;
  if (machineId && machineAnterior && machineId !== machineAnterior) suspeito = "machine_id_trocado";

  const syncs = [...(anterior?.syncs ?? []), agoraMs].slice(-MAX_ITENS);
  if (syncs.filter((t) => agoraMs - t < JANELA_SYNCS_MS).length > MAX_SYNCS_NA_JANELA) {
    suspeito = "syncs_excessivos";
  }

  let boots = [...(anterior?.boots ?? [])];
  if (bootId) {
    const idx = boots.findIndex((b) => b.id === bootId);
    const eraUltimo = idx === boots.length - 1;
    if (idx >= 0 && !eraUltimo && agoraMs - boots[idx].em <= JANELA_ALTERNANCIA_MS) {
      suspeito ??= "boot_alternando";
    }
    if (idx >= 0) boots.splice(idx, 1);
    boots.push({ id: bootId, em: agoraMs });
    boots = boots.slice(-MAX_ITENS);
  }

  const controle: ControleClone = { boots, syncs };
  const machine = machineId ?? machineAnterior;
  if (machine) controle.machine = machine;
  if (anterior?.replays?.length) controle.replays = anterior.replays;
  return { controle, suspeito };
}

/** Conta um REPLAY assinado; suspeito ao atingir LIMIAR_REPLAYS dentro de 10 min. Preserva o resto do controle. */
export function registrarReplay(
  anterior: ControleClone | undefined,
  agoraMs: number
): { controle: ControleClone; suspeito: SuspeitaClone } {
  const recentes = (anterior?.replays ?? []).filter((t) => agoraMs - t <= JANELA_ALTERNANCIA_MS);
  const replays = [...recentes, agoraMs].slice(-MAX_ITENS);
  const controle: ControleClone = { boots: anterior?.boots ?? [], syncs: anterior?.syncs ?? [], replays };
  if (anterior?.machine) controle.machine = anterior.machine;
  return { controle, suspeito: replays.length >= LIMIAR_REPLAYS ? "replay_assinado" : null };
}

/** Lê o controle guardado em `saude._controle` (jsonb); tolera lixo. */
export function lerControle(saude: Record<string, unknown> | null | undefined): ControleClone | undefined {
  const c = saude?._controle as Partial<ControleClone> | undefined;
  if (!c || !Array.isArray(c.boots) || !Array.isArray(c.syncs)) return undefined;
  const boots = c.boots
    .filter((b): b is { id: string; em: number } => typeof b?.id === "string" && Number.isFinite(b?.em))
    .slice(-MAX_ITENS);
  const syncs = c.syncs.filter((t): t is number => Number.isFinite(t)).slice(-MAX_ITENS);
  const controle: ControleClone = { boots, syncs };
  if (typeof c.machine === "string") controle.machine = c.machine.slice(0, 128);
  if (Array.isArray(c.replays)) controle.replays = c.replays.filter((t): t is number => Number.isFinite(t)).slice(-MAX_ITENS);
  return controle;
}
