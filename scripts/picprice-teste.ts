/**
 * Servidor LOCAL de teste do RV Pic Price (não vai para a Vercel).
 * Mesma lógica das rotas (lib/picprice/api.ts) e a fonte REAL, mas o token e
 * o status ficam em memória — para testar o servidor do cliente sem banco.
 *
 *   PICPRICE_TOKEN=rvpp_teste npx tsx scripts/picprice-teste.ts   (porta 7790)
 *
 * Simular estados:  POST /teste/estado {"token":"ativo|revogado","servico":"operante|manutencao","mensagem":"..","previsao":"..",
 *                                        "limite":200,"zerarUso":true}
 * Cota diária igual à do painel (PICPRICE_LIMITE, padrão 200), contada em memória.
 */
import { createServer } from "node:http";

import { tratarGeohash, tratarRanking, tratarStatus, type DepsPicPrice, type StatusServico } from "../lib/picprice/api";
import { aplicarConsumo, usadoHoje } from "../lib/picprice/cota";

const PORTA = Number(process.env.PORTA ?? 7790);
const TOKEN = process.env.PICPRICE_TOKEN ?? "rvpp_teste";
let tokenStatus: "ativo" | "revogado" = "ativo";
let servico: StatusServico = { estado: "operante" };
const cache = new Map<string, { dados: unknown; expira: number }>();
const cota = { dia: null as string | null, qtde: 0, limite: Number(process.env.PICPRICE_LIMITE ?? 200) };

const deps: DepsPicPrice = {
  validarToken: async (t) =>
    t !== TOKEN ? { ok: false, motivo: "inexistente" } : tokenStatus === "revogado" ? { ok: false, motivo: "revogado" } : { ok: true, clienteId: "teste", tokenId: "teste" },
  statusServico: async () => servico,
  cacheGet: async (k) => {
    const c = cache.get(k);
    return c && c.expira > Date.now() ? c.dados : null;
  },
  cacheSet: async (k, dados, min) => void cache.set(k, { dados, expira: Date.now() + min * 60_000 }),
  consumirCota: async (_id, dia) => {
    const r = aplicarConsumo(cota, dia);
    cota.dia = r.dia;
    cota.qtde = r.qtde;
    return { ok: r.ok, usado: r.qtde, limite: cota.limite };
  },
  lerCota: async (_id, dia) => ({ usado: usadoHoje(cota.dia, cota.qtde, dia), limite: cota.limite }),
};

const lerCorpo = (req: import("node:http").IncomingMessage) =>
  new Promise<unknown>((ok) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      try { ok(JSON.parse(s || "{}")); } catch { ok(null); }
    });
  });

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORTA}`);
  const auth = (req.headers.authorization as string) ?? null;
  const t0 = Date.now();
  let r: { status: number; corpo: Record<string, unknown> };
  if (req.method === "GET" && url.pathname === "/api/picprice/ranking") r = await tratarRanking(auth, url.searchParams, deps);
  else if (req.method === "POST" && url.pathname === "/api/picprice/geohash") r = await tratarGeohash(auth, await lerCorpo(req), deps);
  else if (req.method === "GET" && url.pathname === "/api/picprice/status") r = await tratarStatus(auth, deps);
  else if (req.method === "POST" && url.pathname === "/teste/estado") {
    const b = (await lerCorpo(req)) as Record<string, string>;
    if (b?.token === "ativo" || b?.token === "revogado") tokenStatus = b.token;
    if (b?.servico === "operante" || b?.servico === "manutencao") servico = { estado: b.servico, mensagem: b.mensagem ?? null, previsao: b.previsao ?? null };
    const novoLimite = Number((b as Record<string, unknown>)?.limite);
    if (Number.isInteger(novoLimite) && novoLimite >= 1) cota.limite = novoLimite;
    if ((b as Record<string, unknown>)?.zerarUso) cota.qtde = 0;
    r = { status: 200, corpo: { tokenStatus, servico, cota } };
  } else r = { status: 404, corpo: { erro: "rota inexistente" } };
  res.writeHead(r.status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(r.corpo));
  console.log(`${new Date().toISOString()} ${req.method} ${url.pathname} -> ${r.status} ${String(r.corpo.estado ?? "")} ${Date.now() - t0}ms`);
}).listen(PORTA, () => console.log(`RV Pic Price (teste) na porta ${PORTA}`));
