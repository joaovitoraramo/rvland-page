/**
 * Ranking dos menores preços por EAN em volta de cada loja do cliente.
 * Nunca devolve nome/endereço de concorrente: só preço, distância e quando.
 */
import { FONTE_BASE } from "./fonte";

export const TAMANHO_RANKING = 10;
const SIZE_INICIAL = 20; // a fonte corta em `size` e depois junta repetidos

export type ProdutoFonte = {
  id: string;
  desc?: string;
  valor: string | number;
  distkm?: string | number;
  tempo?: string;
  datahora?: string;
  estabelecimento?: { codigo?: string } | null;
};

export type RespostaFonte = { total?: number; tempo?: number; produtos?: ProdutoFonte[] };

export type PrecoRanking = {
  posicao: number;
  valor: number;
  distanciaKm: number;
  ha: string;
  dataHora: string | null;
  descricao: string;
};

export type RankingLoja = {
  loja: string;
  geohash: string;
  totalNaArea: number;
  precos: PrecoRanking[];
};

/**
 * Resposta-isca anti-robô: id só com [a-z0-9.] E código de estabelecimento
 * diferente de 43 caracteres. Exigir as duas marcas evita descartar item real.
 */
export function ehIsca(p: ProdutoFonte): boolean {
  return /^[a-z0-9.]+$/.test(p.id) && (!p.estabelecimento || (p.estabelecimento.codigo ?? "").length !== 43);
}

/** Resposta-isca inteira (anti-robô): veio produto, mas todos são falsos. Não serve nem para o total. */
export function soIsca(res: RespostaFonte): boolean {
  const ps = res.produtos ?? [];
  return ps.length > 0 && ps.every(ehIsca);
}

/** Tira isca, junta repetidos (mesma loja + descrição + preço) e ordena por preço/distância. */
export function montarTop(res: RespostaFonte, tamanho = TAMANHO_RANKING): PrecoRanking[] {
  const vistos = new Set<string>();
  const lista: ProdutoFonte[] = [];
  for (const p of res.produtos ?? []) {
    if (ehIsca(p)) continue;
    const chave = [p.estabelecimento?.codigo, p.desc, p.valor].join("|");
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    lista.push(p);
  }
  lista.sort((a, b) => Number(a.valor) - Number(b.valor) || Number(a.distkm) - Number(b.distkm));
  return lista.slice(0, tamanho).map((p, i) => ({
    posicao: i + 1,
    valor: Number(p.valor),
    distanciaKm: Math.round(Number(p.distkm ?? 0) * 100) / 100,
    ha: p.tempo ?? "",
    dataHora: p.datahora ?? null,
    descricao: (p.desc ?? "").trim(),
  }));
}

export function urlProdutos(p: { geohash: string; gtin: string; raio: number; data: number; size: number }) {
  // mesma ordem de parâmetros do app da fonte; ordem=0 = menor preço
  return (
    `${FONTE_BASE}/produtos?local=${p.geohash}&offset=0&raio=${p.raio}` +
    `&gtin=${encodeURIComponent(p.gtin)}&data=${p.data}&ordem=0&size=${p.size}`
  );
}

/** Ranking de uma loja. `buscar` é injetado (fonte real, cache, mock de teste). */
export async function rankingDaLoja(
  buscar: (url: string) => Promise<RespostaFonte>,
  p: { loja: string; geohash: string; gtin: string; raio: number; data: number }
): Promise<RankingLoja> {
  let res = await buscar(urlProdutos({ ...p, size: SIZE_INICIAL }));
  let top = montarTop(res);
  if (top.length < TAMANHO_RANKING && (res.total ?? 0) > top.length) {
    res = await buscar(urlProdutos({ ...p, size: 50 }));
    top = montarTop(res);
  }
  return { loja: p.loja, geohash: p.geohash, totalNaArea: Number(res.total ?? 0), precos: top };
}

/** "001:6gkzq99z5,002:6gkz..." -> [{loja, geohash}] (valida o geohash). */
export function parseLojas(param: string | null): { loja: string; geohash: string }[] {
  if (!param) return [];
  const saida: { loja: string; geohash: string }[] = [];
  for (const parte of param.split(",")) {
    const [loja, geohash] = parte.split(":").map((s) => s?.trim());
    if (loja && geohash && /^[0-9bcdefghjkmnpqrstuvwxyz]{5,12}$/.test(geohash)) saida.push({ loja, geohash });
  }
  return saida.slice(0, 30);
}
