import { responder } from "@/lib/servicos/hermes-resposta";
import { lerEntradaAgente } from "@/lib/servicos/hermes-http";
import { tratarCredencialHermes } from "@/lib/servicos/hermes-credencial";
import { depsCredencial } from "@/lib/servicos/hermes-runtime";

export const dynamic = "force-dynamic";

/** POST /api/agente/hermes/credencial — credencial de pull do GHCR (assinada em `hermes:credencial:`; 403 se bloqueada/revogada). */
export async function POST(req: Request) {
  const e = await lerEntradaAgente(req);
  if (!e.ok) return responder(e.resposta);
  return responder(await tratarCredencialHermes(e.entrada, depsCredencial));
}
