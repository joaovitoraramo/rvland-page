import "server-only";
import { and, eq } from "drizzle-orm";

import { db, servicoGerenciados } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { statusDeCliente } from "@/lib/consultas/licencas";
import { hojeSP } from "@/lib/dominio/tempo";
import { montarLease } from "@/lib/dominio/lease";
import { assinarLease, type LeaseEnvelope } from "@/lib/crypto/lease";

/**
 * Emite o lease assinado de um servidor: deriva o status de licença do
 * cliente (domínio da Fase 1), junta os serviços licenciados e as flags
 * globais, monta o payload e assina.
 */
export async function emitirLease(servidor: {
  id: string;
  clienteId: string;
}): Promise<LeaseEnvelope> {
  const [licenca, servicos, config] = await Promise.all([
    statusDeCliente(servidor.clienteId),
    db
      .select({ unidade: servicoGerenciados.unidadeSystemd })
      .from(servicoGerenciados)
      .where(
        and(
          eq(servicoGerenciados.servidorId, servidor.id),
          eq(servicoGerenciados.licenciado, true),
          eq(servicoGerenciados.ativo, true)
        )
      ),
    getConfig(),
  ]);

  const payload = montarLease({
    servidorId: servidor.id,
    clienteId: servidor.clienteId,
    hoje: hojeSP(),
    licenca,
    servicosLicenciados: servicos.map((s) => s.unidade),
    modoSimulacao: config.modoSimulacao,
    modoPanico: config.modoPanico,
  });

  return assinarLease(payload);
}
