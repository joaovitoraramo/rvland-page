import { NextResponse } from "next/server";
import { resolverRelease } from "@/lib/servicos/releases";

export const dynamic = "force-dynamic";

const ARCHS = new Set(["amd64", "arm64"]);

/** Metadados de uma release (sha256 + assinatura) para o agente verificar. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const versao = url.searchParams.get("versao") ?? "latest";
  const arch = url.searchParams.get("arch") ?? "amd64";
  if (!ARCHS.has(arch)) return NextResponse.json({ erro: "arch inválida" }, { status: 400 });

  const r = await resolverRelease(versao, arch);
  if (!r) return NextResponse.json({ erro: "release não encontrada" }, { status: 404 });

  return NextResponse.json({ versao: r.versao, arch: r.arch, sha256: r.sha256, assinatura: r.assinatura });
}
