import { SITE_URL } from "@/lib/site";
import { scriptInstalacaoWindows } from "@/lib/dominio/instalador-windows";

export const dynamic = "force-dynamic";

/**
 * Instalador do agente para Windows (PowerShell 5.1+). Não leva token: o
 * comando gerado no painel (ou o .cmd baixado) passa -Token na execução.
 *   powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create(
 *     (Invoke-WebRequest -UseBasicParsing <SITE>/api/agente/instalar.ps1).Content)) -Token XXX ..."
 */
export async function GET() {
  return new Response(scriptInstalacaoWindows(SITE_URL), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
