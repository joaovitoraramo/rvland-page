import { SITE_URL } from "@/lib/site";
import { ipDoRequest } from "@/lib/servicos/hermes-http";
import { entregarBootstrapHermes } from "@/lib/servicos/hermes-bootstrap";
import { depsInstalador } from "@/lib/servicos/hermes-runtime";

export const dynamic = "force-dynamic";

/**
 * GET /hermes/instalar — bootstrap genérico (sem chave) do instalador do Hermes:
 *   curl -fsSL <SITE_URL>/hermes/instalar | sudo bash [-s -- adotar|solicitar ...]
 * Público, com rate limit por IP; a chave nunca vai na URL (ver lib/servicos/hermes-bootstrap.ts).
 */
export async function GET(req: Request) {
  const r = await entregarBootstrapHermes(ipDoRequest(req.headers), SITE_URL, depsInstalador);
  return new Response(r.texto, { status: r.status, headers: r.headers });
}
