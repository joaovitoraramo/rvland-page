import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db, servidores } from "@/lib/db";
import { verificarHeartbeat } from "@/lib/crypto/heartbeat-auth";
import { assinarEnvelope } from "@/lib/crypto/lease";
import { tratarAutorizacao } from "@/lib/picprice/autorizacao";
import { depsBanco } from "@/lib/picprice/servidor";

export const dynamic = "force-dynamic";

/**
 * POST /api/agente/picprice/autorizar — chamado SÓ pelo rvland-agent (módulo
 * picprice), assinado com a chave do servidor (mesmo esquema do heartbeat:
 * X-RVLand-Servidor / X-RVLand-Timestamp / X-RVLand-Assinatura sobre
 * `timestamp + "." + sha256(body)`).
 *
 * Corpo: { token, gtin, lojas: [geohash...], raio, data }
 * Resposta OK: { estado: "OK", autorizacao: { payload, assinatura }, uso }
 * Conta 1 na cota diária do token. Erros seguem os estados do RV Pic Price.
 */
export async function POST(req: Request) {
  const servidorId = req.headers.get("x-rvland-servidor") ?? "";
  const timestamp = req.headers.get("x-rvland-timestamp") ?? "";
  const assinatura = req.headers.get("x-rvland-assinatura") ?? "";
  const rawBody = await req.text();
  const naoAutenticado = () =>
    NextResponse.json({ estado: "AGENTE_NAO_AUTENTICADO", mensagem: "Agente não autenticado." }, { status: 401 });
  // id que não é uuid derrubaria a consulta no banco (500): recusa antes
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(servidorId)) return naoAutenticado();

  const [servidor] = await db
    .select()
    .from(servidores)
    .where(and(eq(servidores.id, servidorId), eq(servidores.status, "ativo")))
    .limit(1);
  if (
    !servidor?.agentePubkey ||
    !verificarHeartbeat({ pubkeyB64: servidor.agentePubkey, timestamp, rawBody, assinaturaB64: assinatura })
  ) {
    return naoAutenticado();
  }

  let corpo: Record<string, unknown> = {};
  try {
    corpo = JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json({ estado: "REQUISICAO_INVALIDA", mensagem: "JSON inválido." }, { status: 400 });
  }
  const token = typeof corpo.token === "string" ? corpo.token : "";
  const r = await tratarAutorizacao(
    { id: servidor.id, clienteId: servidor.clienteId, moduloPicprice: servidor.moduloPicprice },
    token ? `Bearer ${token}` : null,
    corpo,
    { ...depsBanco, assinar: assinarEnvelope }
  );
  return NextResponse.json(r.corpo, { status: r.status });
}
