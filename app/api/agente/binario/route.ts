import { NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";

import { db, servidores } from "@/lib/db";
import { hashToken } from "@/lib/servicos/enrollment";
import { resolverRelease } from "@/lib/servicos/releases";
import {
  autenticarDownload,
  exigirAuthDownload,
  type DepsDownload,
} from "@/lib/servicos/download-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ARCHS = new Set(["amd64", "arm64"]);
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const deps: DepsDownload = {
  async servidorAtivo(id) {
    if (!RE_UUID.test(id)) return null; // id não-uuid derrubaria a consulta
    const [s] = await db
      .select({ id: servidores.id, agentePubkey: servidores.agentePubkey })
      .from(servidores)
      .where(and(eq(servidores.id, id), eq(servidores.status, "ativo")))
      .limit(1);
    return s ?? null;
  },
  async servidorPorEnroll(token) {
    const [s] = await db
      .select({ id: servidores.id })
      .from(servidores)
      .where(
        and(
          eq(servidores.enrollmentTokenHash, hashToken(token)),
          eq(servidores.status, "pendente"),
          gt(servidores.enrollmentExpiraEm, new Date())
        )
      )
      .limit(1);
    return s ?? null;
  },
};

/**
 * Serve o binário do agente do bucket privado. O binário não é secreto — a
 * integridade vem da assinatura de release, verificada pelo próprio agente
 * antes de instalar.
 *
 * Autenticação (ver lib/servicos/download-auth.ts): aceita assinatura de enroll
 * (update do agente) ou o token de enroll (instalação nova). Por COMPATIBILIDADE
 * com o agente 0.5.0 — que baixa SEM credencial e se atualiza assim — o pedido
 * sem credencial AINDA é atendido por ora, só marcado como não autenticado. A
 * exigência (401 sem credencial) fica atrás de RVLAND_EXIGIR_AUTH_DOWNLOAD,
 * DESLIGADO por padrão; ligar só quando não houver mais 0.5.0 no parque.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const versao = url.searchParams.get("versao") ?? "latest";
  const arch = url.searchParams.get("arch") ?? "amd64";
  if (!ARCHS.has(arch)) return NextResponse.json({ erro: "arch inválida" }, { status: 400 });

  const auth = await autenticarDownload(
    {
      versao,
      arch,
      servidorId: req.headers.get("x-rvland-servidor") ?? "",
      timestamp: req.headers.get("x-rvland-timestamp") ?? "",
      assinatura: req.headers.get("x-rvland-assinatura") ?? "",
      enrollToken: req.headers.get("x-rvland-enroll") ?? "",
    },
    deps
  );

  if (auth.metodo === "nenhuma") {
    // Visibilidade: download sem credencial (esperado só do agente 0.5.0 legado).
    console.warn(
      "[agente/binario] download NÃO AUTENTICADO",
      JSON.stringify({ versao, arch, ua: req.headers.get("user-agent") ?? null })
    );
    if (exigirAuthDownload()) {
      return NextResponse.json({ erro: "download requer credencial" }, { status: 401 });
    }
  } else {
    console.info(
      "[agente/binario] download autenticado",
      JSON.stringify({ versao, arch, metodo: auth.metodo, servidor: auth.servidorId })
    );
  }

  const r = await resolverRelease(versao, arch);
  if (!r) return NextResponse.json({ erro: "release não encontrada" }, { status: 404 });

  const { data, error } = await supabaseAdmin().storage.from("agentes").download(r.caminhoStorage);
  if (error || !data) return NextResponse.json({ erro: "binário indisponível" }, { status: 404 });

  const buf = Buffer.from(await data.arrayBuffer());
  return new NextResponse(buf, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="agenterv"`,
      "x-rvland-versao": r.versao,
      "x-rvland-sha256": r.sha256,
    },
  });
}
