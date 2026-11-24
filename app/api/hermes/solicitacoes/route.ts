import { responder } from "@/lib/servicos/hermes-resposta";
import { ipDoRequest, lerCorpoPublico } from "@/lib/servicos/hermes-http";
import { tratarSolicitacao } from "@/lib/servicos/hermes-solicitacao";
import { depsAtivacao } from "@/lib/servicos/hermes-runtime";

export const dynamic = "force-dynamic";

/** POST /api/hermes/solicitacoes — tentativa de instalar sem chave ("Pendente de chave"). Público; corpo ≤ 16 KB. */
export async function POST(req: Request) {
  const c = await lerCorpoPublico(req);
  if (!c.ok) return responder(c.resposta);
  return responder(await tratarSolicitacao({ corpo: c.texto, ip: ipDoRequest(req.headers) }, depsAtivacao));
}
