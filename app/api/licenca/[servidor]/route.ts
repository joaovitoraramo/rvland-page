import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db, servidores, servicoGerenciados } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { statusDeCliente } from "@/lib/consultas/licencas";
import { hojeSP } from "@/lib/dominio/tempo";
import { montarLease } from "@/lib/dominio/lease";

export const dynamic = "force-dynamic";

/**
 * Consulta pública de licença para o BACK do cliente (nunca do navegador):
 * ele mostra "Licenciado até X". Chaveado pelo servidor_id (UUID inadivinhável),
 * read-only, sem dados sensíveis. Cache curto; o back deve falhar em silêncio
 * se a RVLand estiver fora.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ servidor: string }> }
) {
  const { servidor: servidorId } = await params;

  const [servidor] = await db
    .select()
    .from(servidores)
    .where(eq(servidores.id, servidorId))
    .limit(1);

  if (!servidor || servidor.status !== "ativo") {
    return NextResponse.json({ erro: "servidor não encontrado" }, { status: 404 });
  }

  const [licenca, servicos, config] = await Promise.all([
    statusDeCliente(servidor.clienteId),
    db
      .select({ n: servicoGerenciados.id })
      .from(servicoGerenciados)
      .where(eq(servicoGerenciados.servidorId, servidorId)),
    getConfig(),
  ]);

  const lease = montarLease({
    servidorId,
    clienteId: servidor.clienteId,
    hoje: hojeSP(),
    licenca,
    servicosLicenciados: servicos.map(() => ""),
    modoSimulacao: config.modoSimulacao,
    modoPanico: config.modoPanico,
  });

  const licenciado = lease.panico || new Date(lease.operar_ate) > new Date();

  return NextResponse.json(
    {
      status: lease.status,
      licenciado,
      operar_ate: lease.operar_ate,
    },
    { headers: { "cache-control": "public, max-age=300" } }
  );
}
