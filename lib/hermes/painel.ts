/**
 * Regras PURAS do painel do Hermes (sem banco, sem Next): situação das chaves,
 * resumo da saúde reportada pelo agente e a prova exigida para "PASSAR A VALER".
 */

import type { StatusHermes } from "./licenca";

export type SituacaoChave = "ativa" | "usada" | "expirada" | "revogada";

/** usada > revogada > expirada > ativa (uma chave consumida nunca volta a "expirada"). */
export function situacaoChave(
  c: { usadaEm: Date | null; revogadaEm: Date | null; expiraEm: Date },
  agora: Date
): SituacaoChave {
  if (c.usadaEm) return "usada";
  if (c.revogadaEm) return "revogada";
  if (c.expiraEm.getTime() <= agora.getTime()) return "expirada";
  return "ativa";
}

type Saude = Record<string, unknown> | null | undefined;

/**
 * Prova de chave real reportada pelo agente (`saude.chave_configurada`).
 * true/false só para booleano literal; qualquer outra coisa é "sem informação" (null).
 * Vem SÓ de `container.chave_configurada` do sync autenticado (lib/servicos/hermes-sync.ts):
 * agente antigo não envia => ausente => null => o painel não libera "passar a valer".
 */
export function chaveConfigurada(saude: Saude): boolean | null {
  const v = saude?.chave_configurada;
  return typeof v === "boolean" ? v : null;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Subconjunto seguro de `hermes_instalacoes.saude` para a tela (nunca expõe `_controle`). */
export function resumoSaude(saude: Saude): {
  container: string | null;
  saude: string | null;
  relogioConfiavel: boolean | null;
  agenteVersao: string | null;
} {
  return {
    container: texto(saude?.container),
    saude: texto(saude?.saude),
    relogioConfiavel: typeof saude?.relogio_confiavel === "boolean" ? saude.relogio_confiavel : null,
    agenteVersao: texto(saude?.agente_versao),
  };
}

export type ProntidaoEnforcement = {
  pode: boolean;
  /** Por que está bloqueado (pt-BR); null quando pode. */
  motivo: string | null;
  comProva: number;
  total: number;
};

/**
 * "Passar a valer" só com prova, de TODA instalação ativa, de que o Hermes dela
 * tem chave real. Sem instalação ativa não há prova nenhuma: bloqueia.
 * Só `status = ativa` conta: aguardando/revogada/desinstalada não bloqueiam ninguém.
 */
export function avaliarProntidaoEnforcement(
  instalacoes: { id: string; nome: string; status: string; saude: Saude }[]
): ProntidaoEnforcement {
  const ativas = instalacoes.filter((i) => i.status === "ativa");
  const total = ativas.length;
  if (total === 0) {
    return {
      pode: false,
      comProva: 0,
      total,
      motivo: "Nenhuma instalação ativa reportou o estado: sem prova de que o Hermes da frota tem chave real.",
    };
  }
  const sem = ativas.filter((i) => chaveConfigurada(i.saude) !== true);
  const comProva = total - sem.length;
  if (sem.length === 0) return { pode: true, motivo: null, comProva, total };

  if (comProva === 0) {
    return {
      pode: false,
      comProva,
      total,
      motivo:
        `Nenhuma das ${total} instalação(ões) ativa(s) reporta chave_configurada. ` +
        "É preciso agente RV que envie o campo no sync e imagem do Hermes com a chave real (fp igual ao do agente); sem a prova não dá para passar a valer.",
    };
  }
  const nomes = sem.slice(0, 3).map((i) => i.nome).join(", ") + (sem.length > 3 ? "…" : "");
  return {
    pode: false,
    comProva,
    total,
    motivo: `${sem.length} de ${total} instalação(ões) ativa(s) sem prova de chave real: ${nomes}.`,
  };
}

/** Frase digitada para ligar o bloqueio de verdade (confirmação forte). */
export const FRASE_VALER = "VALER HERMES";

export function confirmacaoValerConfere(digitado: string | null | undefined): boolean {
  return typeof digitado === "string" && digitado.trim().toUpperCase() === FRASE_VALER;
}

export const ROTULO_STATUS_LICENCA: Record<StatusHermes, string> = {
  ativa: "Ativa",
  carencia: "Em carência",
  vencida: "Vencida",
  bloqueada: "Bloqueio manual",
  revogada: "Revogada",
  sem_contrato: "Sem contrato",
  cancelada: "Contrato cancelado",
};

/** "2026-11-03" -> "03/11/2026" (data civil, sem fuso). Qualquer outra coisa -> "—". */
export function formatarDataCivil(d: string | null | undefined): string {
  const m = typeof d === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

/** CNPJ de 14 dígitos com máscara; qualquer outro valor volta como veio (null/vazio -> "—"). */
export function formatarCnpj(v: string | null | undefined): string {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : v;
}
