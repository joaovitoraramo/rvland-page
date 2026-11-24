import { responder } from "@/lib/servicos/hermes-resposta";
import { ipDoRequest, lerCorpoPublico } from "@/lib/servicos/hermes-http";
import { ativarHermes } from "@/lib/servicos/hermes-ativacao";
import { depsAtivacao } from "@/lib/servicos/hermes-runtime";

export const dynamic = "force-dynamic";

/** POST /api/hermes/ativacao — CONSOME a chave (uso único, atômico). Público; corpo ≤ 16 KB. */
export async function POST(req: Request) {
  const c = await lerCorpoPublico(req);
  if (!c.ok) return responder(c.resposta);
  return responder(await ativarHermes({ corpo: c.texto, ip: ipDoRequest(req.headers) }, depsAtivacao));
}
