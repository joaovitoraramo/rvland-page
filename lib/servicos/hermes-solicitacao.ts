import { cnpjValido, raizCnpj, soDigitosCnpj } from "@/lib/hermes/cnpj";
import { esquemaSolicitacao, sanitizarIdentificacao } from "@/lib/hermes/protocolo";
import { chaveDeIp, type RespostaHttp } from "./hermes-http";
import { consumirLimite, UMA_HORA_MS, type RepoLimites } from "./hermes-limite";
import type { DadosSolicitacao, RepoSolicitacoes } from "./hermes-ativacao-tipos";
import type { DepsEfeitos } from "./hermes-tipos";

export const LIMITE_SOLICITACOES_POR_HORA_IP = 20;
/** Teto GLOBAL de avisos de Telegram das rotas públicas (sol/div/semref): o 11º da hora vira um resumo. */
export const LIMITE_AVISOS_TELEGRAM_POR_HORA = 10;
const CHAVE_AVISOS_GLOBAL = "tg:global";

export interface DepsSolicitacao extends DepsEfeitos {
  limites: RepoLimites;
  solicitacoes: RepoSolicitacoes;
  /** Cliente cuja raiz de CNPJ casa; só quando for ÚNICO. */
  clientePorRaiz(raiz: string): Promise<string | null>;
}

/** Texto vindo do cliente que vai ao Telegram: sem quebras/controle, tamanho curto. */
export function textoSeguro(v: unknown, max = 80): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "";
}

export function nomeDaIdentificacao(id: Record<string, unknown> | null): string {
  return textoSeguro(id?.razao_social) || textoSeguro(id?.fantasia) || textoSeguro(id?.nome) || "(sem nome)";
}

/**
 * Registra (ou repete) a solicitação, avisa no Telegram no máximo 1x/hora por
 * CNPJ e audita. Compartilhada pela rota de solicitações e pelo CNPJ divergente.
 */
export async function registrarSolicitacao(
  d: Omit<DadosSolicitacao, "clienteProvavelId">,
  deps: DepsSolicitacao,
  opcoes: { auditoria: string; avisoTipo: string; texto: (protocolo: string, tentativas: number) => string }
): Promise<{ protocolo: string; tentativas: number }> {
  const clienteProvavelId = await deps.clientePorRaiz(d.cnpjRaiz);
  const r = await deps.solicitacoes.upsert({ ...d, clienteProvavelId });

  const agora = deps.agora();
  const aviso = await consumirLimite(deps.limites, `tg:${opcoes.avisoTipo}:${d.cnpj}`, 1, UMA_HORA_MS, agora);
  if (aviso.permitido) {
    // rota pública: CNPJs inventados furariam o limite por CNPJ; o teto global protege o Telegram
    const global = await consumirLimite(deps.limites, CHAVE_AVISOS_GLOBAL, LIMITE_AVISOS_TELEGRAM_POR_HORA, UMA_HORA_MS, agora);
    if (global.permitido) {
      await deps.telegram(opcoes.texto(r.protocolo, r.tentativas));
    } else if (global.contagem === LIMITE_AVISOS_TELEGRAM_POR_HORA + 1) {
      await deps.telegram(
        `Hermes: resumo, muitas solicitações/divergências sem chave nesta hora (mais de ${LIMITE_AVISOS_TELEGRAM_POR_HORA}). ` +
          `Novos avisos suspensos até a próxima hora; tudo continua registrado em "Pendentes" no painel e na auditoria.`
      );
    }
  }

  await deps.auditar({
    acao: opcoes.auditoria,
    entidadeId: r.protocolo,
    detalhes: { cnpj: d.cnpj, tentativas: r.tentativas, status: d.status, versao_instalador: d.versaoInstalador },
  });
  return { protocolo: r.protocolo, tentativas: r.tentativas };
}

/** POST /api/hermes/solicitacoes — "Pendente de chave de instalação" no painel. */
export async function tratarSolicitacao(
  e: { corpo: string; ip: string },
  deps: DepsSolicitacao
): Promise<RespostaHttp> {
  const agora = deps.agora();
  const lim = await consumirLimite(
    deps.limites,
    chaveDeIp("sol", e.ip),
    LIMITE_SOLICITACOES_POR_HORA_IP,
    UMA_HORA_MS,
    agora
  );
  if (!lim.permitido) return { status: 429, corpo: { erro: "LIMITE" }, headers: { "retry-after": "3600" } };

  let bruto: unknown;
  try {
    bruto = JSON.parse(e.corpo || "{}");
  } catch {
    return { status: 400, corpo: { erro: "JSON_INVALIDO" } };
  }
  const p = esquemaSolicitacao.safeParse(bruto);
  if (!p.success) return { status: 422, corpo: { erro: "CORPO_INVALIDO" } };
  const c = p.data;

  if (!cnpjValido(c.cnpj)) return { status: 422, corpo: { erro: "CNPJ_INVALIDO" } };
  const cnpj = soDigitosCnpj(c.cnpj);
  const identificacao = sanitizarIdentificacao(c.identificacao);

  const { protocolo } = await registrarSolicitacao(
    {
      cnpj,
      cnpjRaiz: raizCnpj(cnpj),
      identificacao,
      fingerprint: c.fingerprint ?? {},
      origemIdentificacao: c.origem_identificacao ?? null,
      ipOrigem: e.ip === "desconhecido" ? null : e.ip,
      versaoInstalador: c.versao_instalador ?? null,
      status: "pendente",
      motivo: null,
    },
    deps,
    {
      auditoria: "hermes.solicitacao_recebida",
      avisoTipo: "sol",
      texto: (protocolo, tentativas) =>
        `Hermes: tentativa de instalar SEM chave. Nome informado pelo instalador (não verificado): ` +
        `"${nomeDaIdentificacao(identificacao)}" (CNPJ ${cnpj}), protocolo ${protocolo}, tentativa ${tentativas}. ` +
        `Veja em "Pendentes" no painel.`,
    }
  );

  return { status: 202, corpo: { protocolo } };
}
