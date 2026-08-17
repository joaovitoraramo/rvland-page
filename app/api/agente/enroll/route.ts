import { NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { db, servidores, eventos } from "@/lib/db";
import { hashToken } from "@/lib/servicos/enrollment";
import { emitirLease } from "@/lib/servicos/emitir-lease";

export const dynamic = "force-dynamic";

const esquema = z.object({
  token: z.string().min(10),
  agente_pubkey: z.string().min(40), // base64 de 32 bytes
  host: z.string().optional(),
  so: z.string().optional(),
  agente_versao: z.string().optional(),
});

const INTERVALO_SEG = 60;

export async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "json inválido" }, { status: 400 });
  }

  const dados = esquema.safeParse(corpo);
  if (!dados.success) return NextResponse.json({ erro: "campos inválidos" }, { status: 400 });

  const agora = new Date();
  const [servidor] = await db
    .select()
    .from(servidores)
    .where(
      and(
        eq(servidores.enrollmentTokenHash, hashToken(dados.data.token)),
        eq(servidores.status, "pendente"),
        gt(servidores.enrollmentExpiraEm, agora)
      )
    )
    .limit(1);

  // Mensagem única e genérica: não revelar se o token existe/expirou
  if (!servidor) {
    return NextResponse.json({ erro: "token inválido ou expirado" }, { status: 401 });
  }

  await db
    .update(servidores)
    .set({
      status: "ativo",
      agentePubkey: dados.data.agente_pubkey,
      agenteVersao: dados.data.agente_versao ?? null,
      host: dados.data.host ?? servidor.host,
      so: dados.data.so ?? servidor.so,
      enrollmentTokenHash: null,
      enrollmentExpiraEm: null,
      ultimoContatoEm: agora,
    })
    .where(eq(servidores.id, servidor.id));

  await db.insert(eventos).values({
    servidorId: servidor.id,
    tipo: "agente_online",
    severidade: "info",
    mensagem: "Agente registrado (enrollment).",
    dados: { host: dados.data.host, so: dados.data.so },
  });

  const licenca = await emitirLease({ id: servidor.id, clienteId: servidor.clienteId });

  return NextResponse.json({
    servidor_id: servidor.id,
    licenca,
    intervalo_seg: INTERVALO_SEG,
  });
}
