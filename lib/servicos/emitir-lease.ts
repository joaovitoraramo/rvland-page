import "server-only";
import { and, eq } from "drizzle-orm";

import { db, servicoGerenciados, servidores } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { statusDeCliente } from "@/lib/consultas/licencas";
import { hojeSP } from "@/lib/dominio/tempo";
import { montarLease } from "@/lib/dominio/lease";
import { assinarLease, type LeaseEnvelope } from "@/lib/crypto/lease";
import { servidorEhHermes } from "@/lib/servicos/hermes-repo";

/**
 * Emite o lease assinado de um servidor: deriva o status de licença do
 * cliente (domínio da Fase 1), junta os serviços licenciados e as flags
 * globais, monta o payload e assina.
 */
export async function emitirLease(servidor: {
  id: string;
  clienteId: string;
}): Promise<LeaseEnvelope> {
  const [licenca, servicos, config, mods, hermes] = await Promise.all([
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
    db
      .select({ licenca: servidores.moduloLicenca, picprice: servidores.moduloPicprice })
      .from(servidores)
      .where(eq(servidores.id, servidor.id))
      .limit(1),
    servidorEhHermes(servidor.id),
  ]);
  // servidor criado pela ativação Hermes não recebe NADA do Credit: sem módulos (mesmo com a flag
  // ligada no cadastro), sem serviços licenciados e sem o status de licença do cliente
  const modulos = hermes ? { licenca: false, picprice: false } : (mods[0] ?? { licenca: true, picprice: false });

  const payload = montarLease({
    servidorId: servidor.id,
    clienteId: servidor.clienteId,
    hoje: hojeSP(),
    licenca: hermes ? { status: "sem_licenca", venceEm: null, toleradoAte: null } : licenca,
    servicosLicenciados: hermes ? [] : servicos.map((s) => s.unidade),
    modoSimulacao: config.modoSimulacao,
    modoPanico: config.modoPanico,
    modulos,
  });

  return assinarLease(payload);
}
