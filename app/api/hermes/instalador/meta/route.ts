import { responder } from "@/lib/servicos/hermes-resposta";
import { ipDoRequest } from "@/lib/servicos/hermes-http";
import { metaInstalador } from "@/lib/servicos/hermes-instalador";
import { depsInstalador } from "@/lib/servicos/hermes-runtime";

export const dynamic = "force-dynamic";

/** GET /api/hermes/instalador/meta — versão e sha256 da release publicada. */
export async function GET(req: Request) {
  return responder(await metaInstalador(ipDoRequest(req.headers), depsInstalador));
}
