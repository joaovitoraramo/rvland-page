import { NextResponse } from "next/server";

import { tratarStatus } from "@/lib/picprice/api";
import { depsBanco } from "@/lib/picprice/servidor";

export const dynamic = "force-dynamic";
export const preferredRegion = "gru1";

/** Confere token e status e devolve o uso do dia. Não conta na cota. */
export async function GET(req: Request) {
  const r = await tratarStatus(req.headers.get("authorization"), depsBanco);
  return NextResponse.json(r.corpo, { status: r.status });
}
