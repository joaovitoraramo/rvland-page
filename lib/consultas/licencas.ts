import "server-only";
import { and, eq, inArray } from "drizzle-orm";

import { db, contratos, faturas, licencas } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { hojeSP } from "@/lib/dominio/tempo";
import {
  statusLicenca,
  type ResultadoLicenca,
  type EntradaLicenca,
} from "@/lib/dominio/licenca";

export type { ResultadoLicenca };

/**
 * Deriva o status de licença de um conjunto de clientes numa passada só
 * (dashboard, lista, 360). Monta EntradaLicenca por cliente e delega ao
 * domínio puro.
 */
export async function statusDeClientes(
  clienteIds: string[]
): Promise<Map<string, ResultadoLicenca>> {
  const resultado = new Map<string, ResultadoLicenca>();
  if (clienteIds.length === 0) return resultado;

  const config = await getConfig();
  const hoje = hojeSP();

  const [contratosDe, faturasAbertas, linhasLicenca] = await Promise.all([
    db
      .select({
        id: contratos.id,
        clienteId: contratos.clienteId,
        tipo: contratos.tipo,
        status: contratos.status,
        toleranciaDias: contratos.toleranciaDias,
      })
      .from(contratos)
      .where(inArray(contratos.clienteId, clienteIds)),
    db
      .select({
        clienteId: faturas.clienteId,
        contratoId: faturas.contratoId,
        vencimento: faturas.vencimento,
        historica: faturas.historica,
      })
      .from(faturas)
      .where(and(inArray(faturas.clienteId, clienteIds), eq(faturas.status, "aberta"))),
    db.select().from(licencas).where(inArray(licencas.clienteId, clienteIds)),
  ]);

  const toleranciaPorContrato = new Map(
    contratosDe.map((c) => [c.id, c.toleranciaDias])
  );

  const licencaPorCliente = new Map(linhasLicenca.map((l) => [l.clienteId, l]));

  for (const clienteId of clienteIds) {
    const doCliente = contratosDe.filter((c) => c.clienteId === clienteId);
    const recorrentes = doCliente.filter((c) => c.tipo === "recorrente");
    const linha = licencaPorCliente.get(clienteId);

    const entrada: EntradaLicenca = {
      hoje,
      contratosRecorrentesAtivos: recorrentes.filter((c) => c.status === "ativo").length,
      tinhaContratoRecorrente: recorrentes.length > 0,
      faturasAbertas: faturasAbertas
        .filter((f) => f.clienteId === clienteId)
        .map((f) => ({
          vencimento: f.vencimento,
          toleranciaDias: toleranciaPorContrato.get(f.contratoId) ?? 4,
          historica: f.historica,
        })),
      diasConfianca: linha?.diasConfianca ?? 0,
      bloqueioManual: linha?.bloqueioManual ?? false,
      modoPanico: config.modoPanico,
    };

    resultado.set(clienteId, statusLicenca(entrada));
  }

  return resultado;
}

export async function statusDeCliente(clienteId: string): Promise<ResultadoLicenca> {
  const mapa = await statusDeClientes([clienteId]);
  return (
    mapa.get(clienteId) ?? { status: "sem_licenca", venceEm: null, toleradoAte: null }
  );
}
