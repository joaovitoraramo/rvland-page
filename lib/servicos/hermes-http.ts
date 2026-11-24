import { createHash } from "node:crypto";

/** Utilidades HTTP das rotas do Hermes (puras). */

export const LIMITE_CORPO_PUBLICO = 16 * 1024;

/**
 * Lê o corpo respeitando um teto de bytes SEM carregar o excedente: recusa já
 * pelo content-length e corta o stream quando passa do limite.
 */
export async function lerCorpoLimitado(
  req: Request,
  maxBytes: number
): Promise<{ ok: true; texto: string } | { ok: false }> {
  const declarado = Number(req.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > maxBytes) return { ok: false };
  if (!req.body) return { ok: true, texto: "" };

  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await leitor.cancel().catch(() => undefined);
      return { ok: false };
    }
    partes.push(value);
  }
  return { ok: true, texto: Buffer.concat(partes).toString("utf8") };
}

/** IP do cliente (a Vercel sobrescreve x-forwarded-for; o primeiro é o cliente). */
export function ipDoRequest(h: Headers): string {
  const xff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (xff) return xff;
  const real = h.get("x-real-ip")?.trim();
  return real || "desconhecido";
}

/**
 * Agrupa o IP para rate limit: IPv6 pelo /64 (quem tem um prefixo troca os 64
 * bits de baixo à vontade e furaria o limite por endereço); IPv4-mapeado vira o
 * IPv4; IPv4 e qualquer coisa não reconhecida ficam como estão.
 */
export function agruparIp(ip: string): string {
  const s = ip.trim().toLowerCase().split("%")[0];
  const mapeado = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (mapeado) return mapeado[1];
  if (!s.includes(":")) return s;

  const partes = s.split("::");
  if (partes.length > 2) return s;
  const lista = (t: string) => (t ? t.split(":") : []);
  let grupos: string[];
  if (partes.length === 1) {
    grupos = lista(partes[0]);
    if (grupos.length !== 8) return s;
  } else {
    const cabeca = lista(partes[0]);
    const cauda = lista(partes[1]);
    const falta = 8 - cabeca.length - cauda.length;
    if (falta < 1) return s;
    grupos = [...cabeca, ...Array<string>(falta).fill("0"), ...cauda];
  }
  if (!grupos.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return s;
  const n = grupos.map((g) => parseInt(g, 16));
  if (n.slice(0, 5).every((v) => v === 0) && n[5] === 0xffff) {
    // ::ffff:a.b:c.d em hexadecimal
    return `${n[6] >> 8}.${n[6] & 255}.${n[7] >> 8}.${n[7] & 255}`;
  }
  return `${n.slice(0, 4).map((v) => v.toString(16).padStart(4, "0")).join(":")}::/64`;
}

/** Chave de rate limit por IP (IPv6 por /64); o IP não é gravado em claro na tabela de limites. */
export function chaveDeIp(rota: string, ip: string): string {
  return `${rota}:${createHash("sha256").update(agruparIp(ip), "utf8").digest("hex").slice(0, 32)}`;
}

/** Resposta neutra dos serviços; a rota a converte em NextResponse. */
export type RespostaHttp = {
  status: number;
  corpo?: unknown;
  headers?: Record<string, string>;
  redirecionar?: string;
};

export const LIMITE_CORPO_AGENTE = 64 * 1024;

const CORPO_GRANDE: RespostaHttp = { status: 413, corpo: { erro: "CORPO_GRANDE" } };

/** Corpo das rotas PÚBLICAS: no máximo 16 KB. */
export async function lerCorpoPublico(
  req: Request
): Promise<{ ok: true; texto: string } | { ok: false; resposta: RespostaHttp }> {
  const c = await lerCorpoLimitado(req, LIMITE_CORPO_PUBLICO);
  return c.ok ? c : { ok: false, resposta: CORPO_GRANDE };
}

/** Pedido assinado do agente (headers X-RVLand-* + corpo cru, que é o que se assinou; ver lib/hermes/assinatura-agente.ts). */
export async function lerEntradaAgente(req: Request): Promise<
  | { ok: true; entrada: { servidorId: string; timestamp: string; assinatura: string; rawBody: string } }
  | { ok: false; resposta: RespostaHttp }
> {
  const c = await lerCorpoLimitado(req, LIMITE_CORPO_AGENTE);
  if (!c.ok) return { ok: false, resposta: CORPO_GRANDE };
  return {
    ok: true,
    entrada: {
      servidorId: req.headers.get("x-rvland-servidor") ?? "",
      timestamp: req.headers.get("x-rvland-timestamp") ?? "",
      assinatura: req.headers.get("x-rvland-assinatura") ?? "",
      rawBody: c.texto,
    },
  };
}
