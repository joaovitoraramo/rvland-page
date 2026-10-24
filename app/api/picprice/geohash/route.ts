import { NextResponse } from "next/server";

import { tratarGeohash } from "@/lib/picprice/api";
import { depsBanco } from "@/lib/picprice/servidor";

export const dynamic = "force-dynamic";
// a fonte e o geocodificador respondem melhor de dentro do Brasil
export const preferredRegion = "gru1";
export const maxDuration = 60;

/** Chamado pelo BACK do cliente (SyncCompras), nunca pelo navegador. */
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const r = await tratarGeohash(req.headers.get("authorization"), corpo, depsBanco);
  return NextResponse.json(r.corpo, { status: r.status });
}
