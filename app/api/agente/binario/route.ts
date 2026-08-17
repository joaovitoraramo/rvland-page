import { NextResponse } from "next/server";
import { resolverRelease } from "@/lib/servicos/releases";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ARCHS = new Set(["amd64", "arm64"]);

/**
 * Serve o binário do agente do bucket privado. Público de propósito: o binário
 * não é secreto — a integridade vem da assinatura de release, verificada pelo
 * próprio agente antes de instalar.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const versao = url.searchParams.get("versao") ?? "latest";
  const arch = url.searchParams.get("arch") ?? "amd64";
  if (!ARCHS.has(arch)) return NextResponse.json({ erro: "arch inválida" }, { status: 400 });

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
