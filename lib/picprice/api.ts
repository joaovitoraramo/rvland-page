/**
 * Regras dos endpoints do RV Pic Price, independentes do Next/banco
 * (dependências injetadas). As rotas em app/api/picprice só ligam isto ao banco.
 *
 * Toda resposta traz `estado`, que o servidor do cliente repassa ao Hermes:
 *   OK | TOKEN_INVALIDO | MANUTENCAO | FONTE_INDISPONIVEL | LIMITE_EXCEDIDO
 *   | REQUISICAO_INVALIDA | ENDERECO_NAO_ENCONTRADO
 */
import { buscarFonte, FonteIndisponivel } from "./fonte";
import { geocodificar } from "./geocode";
import { parseLojas, rankingDaLoja, type RankingLoja, type RespostaFonte } from "./ranking";

export type ValidacaoToken =
  | { ok: true; clienteId: string; tokenId: string }
  | { ok: false; motivo: "inexistente" | "revogado" };

export type StatusServico = { estado: "operante" | "manutencao"; mensagem?: string | null; previsao?: string | null };

export type DepsPicPrice = {
  validarToken: (token: string) => Promise<ValidacaoToken>;
  statusServico: () => Promise<StatusServico>;
  cacheGet: (chave: string) => Promise<unknown | null>;
  cacheSet: (chave: string, dados: unknown, minutos: number) => Promise<void>;
  registrarUso?: (tokenId: string) => Promise<void>;
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

/** Token -> manutenção -> limite. Devolve a resposta de erro ou o tokenId. */
async function porteiro(
  authorization: string | null,
  deps: DepsPicPrice
): Promise<{ erro: Resposta } | { tokenId: string }> {
  const token = extrairToken(authorization);
  const v = token ? await deps.validarToken(token) : ({ ok: false, motivo: "inexistente" } as const);
  if (!v.ok) {
    return {
      erro: {
        status: 401,
        corpo: {
          estado: "TOKEN_INVALIDO",
          motivo: v.motivo,
          mensagem: v.motivo === "revogado" ? "Serviço inválido - token revogado" : "Serviço inválido - token inválido",
        },
      },
    };
  }
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
  await deps.registrarUso?.(v.tokenId).catch(() => undefined);
  return { tokenId: v.tokenId };
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
    if (!r) return { status: 404, corpo: { estado: "ENDERECO_NAO_ENCONTRADO", mensagem: "Endereço não encontrado no Paraná." } };
    return { status: 200, corpo: { estado: "OK", ...r } };
  } catch (e) {
    return { status: 503, corpo: { estado: "FONTE_INDISPONIVEL", mensagem: "Geocodificador indisponível: " + (e as Error).message } };
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
    const dados = (await buscarReal(url)) as RespostaFonte;
    await deps.cacheSet(chave, dados, CACHE_MINUTOS).catch(() => undefined);
    return dados;
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
      },
    };
  }
  const falharam = lojas.filter((l) => !ok.some((r) => r.loja === l.loja)).map((l) => l.loja);
  return {
    status: 200,
    corpo: { estado: "OK", gtin, raio, data, consultadoEm: new Date().toISOString(), lojas: ok, lojasSemResposta: falharam },
  };
}
