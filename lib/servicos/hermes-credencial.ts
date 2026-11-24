import { z } from "zod";

import { autenticarAgenteHermes, type DepsAuthAgente, type EntradaAgente } from "./hermes-agente-auth";
import { derivarDocumento, type DepsLicenca } from "./hermes-licenca-instalacao";
import { consumirLimite, UMA_HORA_MS, type RepoLimites } from "./hermes-limite";
import type { RespostaHttp } from "./hermes-http";
import type { DepsEfeitos } from "./hermes-tipos";

export const REPOSITORIO_PADRAO = "ghcr.io/rvland-devs/hermes";
export const LIMITE_CREDENCIAL_POR_HORA = 30;
const VALIDADE_CREDENCIAL_MS = 3600_000;

export type CredencialRegistro = {
  usuario: string;
  /** O segredo: nunca logar, auditar nem devolver em erro. */
  token: string;
  repositorio?: string;
  expiraEm?: Date;
};

export interface DepsCredencial extends DepsAuthAgente, DepsLicenca, DepsEfeitos {
  limites: RepoLimites;
  /** Lê `HERMES_REGISTRO_USUARIO`/`HERMES_REGISTRO_TOKEN` (por NOME, no ambiente); null se ausentes. */
  credencialRegistro(): CredencialRegistro | null;
}

/** Corpo OBRIGATÓRIO e estrito: exatamente `{"pedido":"credencial"}`. */
const corpoCredencial = z.strictObject({ pedido: z.literal("credencial") });

/**
 * POST /api/agente/hermes/credencial — entrega a credencial de pull do GHCR a
 * uma instalação em dia. Autenticada no domínio `hermes:credencial:` (ver
 * lib/hermes/assinatura-agente.ts). SEM anti-replay por
 * timestamp (compartilharia `ultimo_ts_agente` com o sync e geraria falsos
 * REPLAY): vale a janela de ±5 min, TLS e o limite de 30/h por servidor.
 *
 * Quem não pode receber versões novas: instalação revogada e bloqueio manual
 * (atos do dono) sempre; status financeiro bloqueante só com o enforcement
 * valendo (em simulação nada bloqueia, coerente com o documento de licença).
 * Pânico global afasta o bloqueio financeiro (`bloqueante` já vem falso).
 */
export async function tratarCredencialHermes(e: EntradaAgente, deps: DepsCredencial): Promise<RespostaHttp> {
  const auth = await autenticarAgenteHermes(e, "credencial", deps);
  if (!auth.ok) return auth.resposta;
  const { servidor, instalacao, agora } = auth;

  let bruto: unknown;
  try {
    bruto = JSON.parse(e.rawBody);
  } catch {
    // inclui corpo vazio: o corpo é obrigatório
    return e.rawBody.trim() === "" ? { status: 422, corpo: { erro: "CORPO_INVALIDO" } } : { status: 400, corpo: { erro: "JSON_INVALIDO" } };
  }
  if (!corpoCredencial.safeParse(bruto).success) return { status: 422, corpo: { erro: "CORPO_INVALIDO" } };

  const lim = await consumirLimite(deps.limites, `cred:${servidor.id}`, LIMITE_CREDENCIAL_POR_HORA, UMA_HORA_MS, agora);
  if (!lim.permitido) return { status: 429, corpo: { erro: "LIMITE" }, headers: { "retry-after": "3600" } };

  const { licenca, modo } = await derivarDocumento(instalacao, agora, deps);
  const atoDoDono = licenca.status === "revogada" || licenca.status === "bloqueada";
  if (atoDoDono || (licenca.bloqueante && modo === "valendo")) {
    await deps.auditar({
      acao: "hermes.credencial_negada",
      entidadeId: instalacao.id,
      detalhes: { status: licenca.status, modo },
    });
    return { status: 403, corpo: { erro: "INSTALACAO_BLOQUEADA" } };
  }

  const c = deps.credencialRegistro();
  if (!c?.usuario || !c.token) return { status: 503, corpo: { erro: "INDISPONIVEL" } };

  await deps.auditar({
    acao: "hermes.credencial_entregue",
    entidadeId: instalacao.id,
    detalhes: {
      servidor_id: servidor.id,
      status: licenca.status,
      modo,
      // em simulação a entrega passa, mas com o enforcement valendo seria negada
      negaria_se_valendo: licenca.bloqueante,
    },
  });

  return {
    status: 200,
    corpo: {
      repositorio: c.repositorio ?? REPOSITORIO_PADRAO,
      registro: "ghcr.io",
      usuario: c.usuario,
      senha: c.token,
      // data ausente ou já vencida (HERMES_REGISTRO_EXPIRA_EM esquecida) nunca produz credencial vencida
      expira_em: (c.expiraEm && c.expiraEm.getTime() > agora.getTime()
        ? c.expiraEm
        : new Date(agora.getTime() + VALIDADE_CREDENCIAL_MS)
      ).toISOString(),
    },
    headers: { "cache-control": "no-store" },
  };
}
