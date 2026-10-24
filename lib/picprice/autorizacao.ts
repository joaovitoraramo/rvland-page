/**
 * Autorização do RV Pic Price para o AGENTE local (rvland-agent, módulo picprice).
 *
 * O agente roda no servidor do cliente e consulta a fonte de lá. Antes de cada
 * consulta ele pede autorização aqui: a plataforma confere o módulo do servidor,
 * o token RV Pic Price (tem que ser do mesmo cliente do servidor), o status do
 * serviço e a cota diária — conta a consulta — e devolve uma autorização
 * ASSINADA (mesma chave Ed25519 do lease), curta e amarrada ao servidor, ao EAN
 * e às lojas. O agente só consulta a fonte com uma autorização válida.
 *
 * Independente de Next/banco: dependências injetadas (testável).
 */
import { porteiro, type DepsPicPrice, type Resposta } from "./api";

export const VALIDADE_AUTORIZACAO_S = 90;
const RE_GEOHASH = /^[0-9bcdefghjkmnpqrstuvwxyz]{5,12}$/;

export type PayloadAutorizacao = {
  v: 1;
  tipo: "picprice_autorizacao";
  servidor_id: string;
  cliente_id: string;
  gtin: string;
  lojas: string[]; // geohashes, ordenados
  raio: number;
  data: number;
  emitido_em: string;
  expira_em: string;
};

export type EnvelopeAssinado = { payload: string; assinatura: string };

export type ServidorAgente = { id: string; clienteId: string; moduloPicprice: boolean };

/** Normaliza e valida o pedido do agente. Null = inválido. */
export function lerPedido(corpo: unknown): { gtin: string; lojas: string[]; raio: number; data: number } | null {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const gtin = String(c.gtin ?? "").replace(/\D/g, "").replace(/^0+(?=\d{8})/, "");
  if (gtin.length < 8 || gtin.length > 14) return null;
  const lojas = Array.isArray(c.lojas) ? c.lojas.map((g) => String(g).trim().toLowerCase()) : [];
  if (!lojas.length || lojas.length > 30 || !lojas.every((g) => RE_GEOHASH.test(g))) return null;
  const raio = Math.min(20, Math.max(0.5, Number(c.raio ?? 3) || 3));
  const data = Math.min(6, Math.max(-1, Math.trunc(Number(c.data ?? -1))));
  return { gtin, lojas: [...new Set(lojas)].sort(), raio, data };
}

export async function tratarAutorizacao(
  servidor: ServidorAgente,
  authorization: string | null,
  corpo: unknown,
  deps: DepsPicPrice & { assinar: (p: PayloadAutorizacao) => EnvelopeAssinado },
  agora: Date = new Date()
): Promise<Resposta> {
  if (!servidor.moduloPicprice) {
    return {
      status: 403,
      corpo: { estado: "MODULO_DESATIVADO", mensagem: "Módulo RV Pic Price desligado neste servidor (painel da RV)." },
    };
  }
  const pedido = lerPedido(corpo);
  if (!pedido) {
    return { status: 400, corpo: { estado: "REQUISICAO_INVALIDA", mensagem: "Envie gtin (8 a 14 dígitos) e as lojas (geohash)." } };
  }
  // token -> mesmo cliente do servidor -> manutenção -> rajada -> cota (conta 1)
  const p = await porteiro(authorization, deps, agora, servidor.clienteId);
  if ("erro" in p) return p.erro;

  const payload: PayloadAutorizacao = {
    v: 1,
    tipo: "picprice_autorizacao",
    servidor_id: servidor.id,
    cliente_id: servidor.clienteId,
    ...pedido,
    emitido_em: agora.toISOString(),
    expira_em: new Date(agora.getTime() + VALIDADE_AUTORIZACAO_S * 1000).toISOString(),
  };
  return { status: 200, corpo: { estado: "OK", autorizacao: deps.assinar(payload), uso: p.uso } };
}
