import { NextResponse } from "next/server";
import { z } from "zod";

import { registrarVisita } from "@/lib/servicos/visitas-conceito";

export const dynamic = "force-dynamic";

const esquema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{1,60}$/),
  visitante: z.string().trim().regex(/^[a-z0-9]{8,40}$/),
  sessao: z.string().trim().regex(/^[a-z0-9]{8,40}$/),
  segundos: z.number().int().min(0).max(3600),
  referencia: z.string().trim().max(300).nullable().optional(),
});

/**
 * Recebe a abertura de um conceito hospedado em /c/<slug>.
 *
 * Responde 204 em qualquer desfecho, inclusive quando descarta um robô: o
 * navegador do prospect não deve nem perceber que isso existe, e um erro aqui
 * jamais pode aparecer na página que está sendo usada para vender.
 */
export async function POST(req: Request) {
  try {
    const dados = esquema.safeParse(await req.json());
    if (!dados.success) return new NextResponse(null, { status: 204 });

    await registrarVisita({
      ...dados.data,
      referencia: dados.data.referencia ?? null,
      userAgent: req.headers.get("user-agent"),
      // a Vercel resolve a geografia na borda, sem serviço externo nem custo
      cidade: decodeURIComponent(req.headers.get("x-vercel-ip-city") ?? "") || null,
      pais: req.headers.get("x-vercel-ip-country") || null,
    });
  } catch (err) {
    console.error("[api/c/visita] falhou:", err);
  }

  return new NextResponse(null, { status: 204 });
}
