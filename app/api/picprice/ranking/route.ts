import { NextResponse } from "next/server";

import { tratarRanking } from "@/lib/picprice/api";
import { depsBanco } from "@/lib/picprice/servidor";

export const dynamic = "force-dynamic";
// a fonte de preços responde melhor (e às vezes só) de dentro do Brasil
export const preferredRegion = "gru1";
export const maxDuration = 60;

/** Chamado pelo BACK do cliente (SyncCompras), nunca pelo navegador. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await tratarRanking(req.headers.get("authorization"), url.searchParams, depsBanco);
  return NextResponse.json(r.corpo, { status: r.status });
}
