import { NextResponse } from "next/server";
import { z } from "zod";

import { registrarCliques } from "@/lib/servicos/cliques-conceito";

export const dynamic = "force-dynamic";

const esquema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{1,60}$/),
  visitante: z.string().trim().regex(/^[a-z0-9]{8,40}$/),
  sessao: z.string().trim().regex(/^[a-z0-9]{8,40}$/),
  itens: z
    .array(
      z.object({
        rotulo: z.string().max(200),
        secao: z.string().max(120).nullable().optional(),
        destino: z.string().max(600).nullable().optional(),
      })
    )
    .min(1)
    .max(40),
  teste: z.boolean().optional(),
});

/**
 * Recebe um lote de cliques dentro de um conceito hospedado em /c/<slug>.
 *
 * Responde 204 em qualquer desfecho, como a rota de visita: nada aqui pode
 * aparecer na página que está sendo usada para vender.
 */
export async function POST(req: Request) {
  try {
    const dados = esquema.safeParse(await req.json());
    if (!dados.success) return new NextResponse(null, { status: 204 });

    await registrarCliques({
      slug: dados.data.slug,
      visitante: dados.data.visitante,
      sessao: dados.data.sessao,
      itens: dados.data.itens.map((i) => ({
        rotulo: i.rotulo,
        secao: i.secao ?? null,
        destino: i.destino ?? null,
      })),
      teste: dados.data.teste === true,
      userAgent: req.headers.get("user-agent"),
    });
  } catch (err) {
    console.error("[api/c/clique] falhou:", err);
  }

  return new NextResponse(null, { status: 204 });
}
