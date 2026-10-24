/**
 * Regras dos endpoints do RV Pic Price, independentes do Next/banco
 * (dependências injetadas). As rotas em app/api/picprice só ligam isto ao banco.
 *
 * Toda resposta traz `estado`, que o servidor do cliente repassa ao Hermes:
 *   OK | TOKEN_INVALIDO | MANUTENCAO | FONTE_INDISPONIVEL | LIMITE_EXCEDIDO
 *   | LIMITE_DIARIO | REQUISICAO_INVALIDA | ENDERECO_NAO_ENCONTRADO
 *
 * Cota diária por token (padrão 200): toda requisição aceita em ranking e
 * geohash conta, inclusive as respondidas pelo cache. Token inválido não conta.
 * As respostas OK trazem `uso: {usado, limite, zeraEm}`.
 */
import { buscarFonte, FonteIndisponivel } from "./fonte";
import { geocodificar } from "./geocode";
import { parseLojas, rankingDaLoja, soIsca, type RankingLoja, type RespostaFonte } from "./ranking";
import { diaSaoPaulo, proximaMeiaNoiteSaoPaulo, type UsoDiario } from "./cota";

export type ValidacaoToken =
  | { ok: true; clienteId: string; tokenId: string }
  | { ok: false; motivo: "inexistente" | "revogado" };

export type StatusServico = { estado: "operante" | "manutencao"; mensagem?: string | null; previsao?: string | null };

export type DepsPicPrice = {
  validarToken: (token: string) => Promise<ValidacaoToken>;
  statusServico: () => Promise<StatusServico>;
  cacheGet: (chave: string) => Promise<unknown | null>;
  cacheSet: (chave: string, dados: unknown, minutos: number) => Promise<void>;
  /**
   * Conta 1 requisição do token no dia (atômico). ok=false quando o limite do
   * dia já foi atingido (aí não soma). Também atualiza o último uso.
   */
  consumirCota?: (tokenId: string, dia: string) => Promise<{ ok: boolean; usado: number; limite: number }>;
  /** Lê o uso do dia sem contar (usado pelo /status). */
  lerCota?: (tokenId: string, dia: string) => Promise<{ usado: number; limite: number }>;
  /** troca da fonte em teste; padrão = fonte real blindada */
  buscar?: (url: string) => Promise<unknown>;
};

export type Resposta = { status: number; corpo: Record<string, unknown> };

const CACHE_MINUTOS = 45;
const LIMITE_POR_MINUTO = 120;
const janelas = new Map<string, { inicio: number; n: number }>();

/** Rate limit simples por token (memória da instância). */
export function dentroDoLimite(chave: string, agora = Date.now()): boolean {
  const j = janelas.get(chave);
  if (!j || agora - j.inicio >= 60_000) {
    janelas.set(chave, { inicio: agora, n: 1 });
    return true;
  }
  j.n++;
  return j.n <= LIMITE_POR_MINUTO;
}

export function extrairToken(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

function respostaTokenInvalido(motivo: "inexistente" | "revogado"): Resposta {
  return {
    status: 401,
    corpo: {
      estado: "TOKEN_INVALIDO",
      motivo,
      mensagem: motivo === "revogado" ? "Serviço inválido - token revogado" : "Serviço inválido - token inválido",
    },
  };
}

/** Token -> manutenção -> rajada por minuto -> cota diária. Devolve a resposta de erro ou o tokenId + uso. */
async function porteiro(
  authorization: string | null,
  deps: DepsPicPrice,
  agora: Date = new Date()
): Promise<{ erro: Resposta } | { tokenId: string; uso: UsoDiario | null }> {
  const token = extrairToken(authorization);
  const v = token ? await deps.validarToken(token) : ({ ok: false, motivo: "inexistente" } as const);
  if (!v.ok) return { erro: respostaTokenInvalido(v.motivo) };
  const st = await deps.statusServico();
  if (st.estado === "manutencao") {
    return {
      erro: {
        status: 503,
        corpo: {
          estado: "MANUTENCAO",
          mensagem: st.mensagem || "Manutenção programada",
          previsao: st.previsao ?? null,
        },
      },
    };
  }
  if (!dentroDoLimite(v.tokenId)) {
    return { erro: { status: 429, corpo: { estado: "LIMITE_EXCEDIDO", mensagem: "Muitas consultas em pouco tempo. Tente de novo em instantes." } } };
  }
  const zeraEm = proximaMeiaNoiteSaoPaulo(agora);
  if (!deps.consumirCota) return { tokenId: v.tokenId, uso: null };
  const c = await deps.consumirCota(v.tokenId, diaSaoPaulo(agora));
  const uso: UsoDiario = { usado: c.usado, limite: c.limite, zeraEm };
  if (!c.ok) {
    return {
      erro: {
        status: 429,
        corpo: { estado: "LIMITE_DIARIO", mensagem: "Limite diário de consultas atingido", ...uso, uso },
      },
    };
  }
  return { tokenId: v.tokenId, uso };
}

/**
 * GET /api/picprice/status — confere token e status do serviço e devolve o uso
 * do dia. NÃO conta na cota (serve para "Testar conexão").
 */
export async function tratarStatus(authorization: string | null, deps: DepsPicPrice, agora: Date = new Date()): Promise<Resposta> {
  const token = extrairToken(authorization);
  const v = token ? await deps.validarToken(token) : ({ ok: false, motivo: "inexistente" } as const);
  if (!v.ok) return respostaTokenInvalido(v.motivo);
  const lido = deps.lerCota ? await deps.lerCota(v.tokenId, diaSaoPaulo(agora)) : null;
  const uso: UsoDiario | null = lido ? { ...lido, zeraEm: proximaMeiaNoiteSaoPaulo(agora) } : null;
  const st = await deps.statusServico();
  if (st.estado === "manutencao") {
    return { status: 503, corpo: { estado: "MANUTENCAO", mensagem: st.mensagem || "Manutenção programada", previsao: st.previsao ?? null, uso } };
  }
  if (uso && uso.usado >= uso.limite) {
    return { status: 200, corpo: { estado: "LIMITE_DIARIO", mensagem: "Limite diário de consultas atingido", ...uso, uso } };
  }
  return { status: 200, corpo: { estado: "OK", uso } };
}

/** POST /api/picprice/geohash {endereco} */
export async function tratarGeohash(authorization: string | null, corpo: unknown, deps: DepsPicPrice): Promise<Resposta> {
  const p = await porteiro(authorization, deps);
  if ("erro" in p) return p.erro;
  const endereco = String((corpo as { endereco?: unknown })?.endereco ?? "").trim();
  if (endereco.length < 5) {
    return { status: 400, corpo: { estado: "REQUISICAO_INVALIDA", mensagem: "Informe o endereço da loja." } };
  }
  try {
    const r = await geocodificar(endereco);
    if (!r) return { status: 404, corpo: { estado: "ENDERECO_NAO_ENCONTRADO", mensagem: "Endereço não encontrado no Paraná.", uso: p.uso } };
    return { status: 200, corpo: { estado: "OK", ...r, uso: p.uso } };
  } catch (e) {
    return { status: 503, corpo: { estado: "FONTE_INDISPONIVEL", mensagem: "Geocodificador indisponível: " + (e as Error).message, uso: p.uso } };
  }
}

/** GET /api/picprice/ranking?gtin=&lojas=001:geohash,...&raio=3&data=-1 */
export async function tratarRanking(authorization: string | null, params: URLSearchParams, deps: DepsPicPrice): Promise<Resposta> {
  const p = await porteiro(authorization, deps);
  if ("erro" in p) return p.erro;

  const gtin = (params.get("gtin") ?? "").replace(/\D/g, "").replace(/^0+(?=\d{8})/, "");
  const lojas = parseLojas(params.get("lojas"));
  const raio = Math.min(20, Math.max(0.5, Number(params.get("raio") ?? 3) || 3));
  const data = Math.min(6, Math.max(-1, Math.trunc(Number(params.get("data") ?? -1))));
  if (gtin.length < 8 || gtin.length > 14) {
    return { status: 400, corpo: { estado: "REQUISICAO_INVALIDA", mensagem: "EAN inválido." } };
  }
  if (!lojas.length) {
    return { status: 400, corpo: { estado: "REQUISICAO_INVALIDA", mensagem: "Informe as lojas no formato codigo:geohash." } };
  }

  const buscarReal = deps.buscar ?? buscarFonte;
  const buscarComCache = async (url: string) => {
    const chave = "picprice:" + url;
    const guardado = await deps.cacheGet(chave).catch(() => null);
    if (guardado) return guardado as RespostaFonte;
    // a fonte às vezes devolve só itens falsos (isca anti-robô): tenta de novo e nunca guarda isso
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const dados = (await buscarReal(url)) as RespostaFonte;
      if (!soIsca(dados)) {
        await deps.cacheSet(chave, dados, CACHE_MINUTOS).catch(() => undefined);
        return dados;
      }
      await new Promise((ok) => setTimeout(ok, 800 * (tentativa + 1)));
    }
    throw new FonteIndisponivel("a fonte devolveu só resultados falsos");
  };

  const resultados = await Promise.allSettled(
    lojas.map((l) => rankingDaLoja(buscarComCache, { ...l, gtin, raio, data }))
  );
  const ok = resultados.filter((r): r is PromiseFulfilledResult<RankingLoja> => r.status === "fulfilled").map((r) => r.value);
  if (!ok.length) {
    const motivo = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    return {
      status: 503,
      corpo: {
        estado: "FONTE_INDISPONIVEL",
        mensagem: "A fonte de preços não respondeu. Tente de novo em instantes.",
        detalhe: motivo?.reason instanceof FonteIndisponivel ? motivo.reason.message : String(motivo?.reason ?? ""),
        uso: p.uso,
      },
    };
  }
  const falharam = lojas.filter((l) => !ok.some((r) => r.loja === l.loja)).map((l) => l.loja);
  return {
    status: 200,
    corpo: { estado: "OK", gtin, raio, data, consultadoEm: new Date().toISOString(), lojas: ok, lojasSemResposta: falharam, uso: p.uso },
  };
}
