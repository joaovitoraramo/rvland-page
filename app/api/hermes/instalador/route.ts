import { responder } from "@/lib/servicos/hermes-resposta";
import { ipDoRequest } from "@/lib/servicos/hermes-http";
import { entregarInstalador } from "@/lib/servicos/hermes-instalador";
import { depsInstalador } from "@/lib/servicos/hermes-runtime";

export const dynamic = "force-dynamic";

/** GET /api/hermes/instalador?arch=amd64|arm64 — 302 para URL assinada de 60 s (público, com rate limit por IP). */
export async function GET(req: Request) {
  const arch = new URL(req.url).searchParams.get("arch");
  return responder(await entregarInstalador(arch, ipDoRequest(req.headers), depsInstalador));
}
