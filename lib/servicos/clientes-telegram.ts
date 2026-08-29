import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";

import { db, clientes, faturas } from "@/lib/db";
import { statusDeClientes } from "@/lib/consultas/licencas";
import { mensagemClientes, type ClienteResumo } from "@/lib/dominio/telegram";

/** Executa /clientes: ativos em ordem alfabética, com licença e abertas. */
export async function executarComandoClientes(): Promise<string[]> {
  const ativos = await db
    .select({ id: clientes.id, nome: clientes.nome })
    .from(clientes)
    .where(eq(clientes.status, "ativo"))
    .orderBy(asc(clientes.nome));

  if (ativos.length === 0) return mensagemClientes([]);

  const ids = ativos.map((c) => c.id);
  const [statusPorCliente, abertas] = await Promise.all([
    statusDeClientes(ids),
    db
      .select({
        id: faturas.id,
        clienteId: faturas.clienteId,
        competencia: faturas.competencia,
        valorCentavos: faturas.valorCentavos,
        vencimento: faturas.vencimento,
      })
      .from(faturas)
      .where(
        and(
          inArray(faturas.clienteId, ids),
          eq(faturas.status, "aberta"),
          eq(faturas.historica, false)
        )
      )
      .orderBy(asc(faturas.vencimento)),
  ]);

  const resumos: ClienteResumo[] = ativos.map((c) => ({
    id: c.id,
    nome: c.nome,
    licenca: statusPorCliente.get(c.id)?.status ?? "sem_licenca",
    faturas: abertas
      .filter((f) => f.clienteId === c.id)
      .map(({ id, competencia, valorCentavos, vencimento }) => ({
        id,
        competencia,
        valorCentavos,
        vencimento,
      })),
  }));

  return mensagemClientes(resumos);
}
