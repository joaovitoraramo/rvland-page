import { NextResponse } from "next/server";
import type { RespostaHttp } from "./hermes-http";

/** Converte a resposta neutra dos serviços em NextResponse (a única cola HTTP das rotas do Hermes). */
export function responder(r: RespostaHttp): NextResponse {
  if (r.redirecionar) {
    return NextResponse.redirect(r.redirecionar, { status: r.status, headers: r.headers });
  }
  return NextResponse.json(r.corpo ?? {}, { status: r.status, headers: r.headers });
}
