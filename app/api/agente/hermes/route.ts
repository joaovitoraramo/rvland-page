import { responder } from "@/lib/servicos/hermes-resposta";
import { lerEntradaAgente } from "@/lib/servicos/hermes-http";
import { tratarSyncHermes } from "@/lib/servicos/hermes-sync";
import { depsSync } from "@/lib/servicos/hermes-runtime";

export const dynamic = "force-dynamic";

/**
 * POST /api/agente/hermes — canal paralelo de licença do Hermes (assinatura de domínio
 * próprio, lib/hermes/assinatura-agente.ts). Lógica em lib/servicos/hermes-sync.ts; esta rota só liga HTTP.
 */
export async function POST(req: Request) {
  const e = await lerEntradaAgente(req);
  if (!e.ok) return responder(e.resposta);
  return responder(await tratarSyncHermes(e.entrada, depsSync));
}
