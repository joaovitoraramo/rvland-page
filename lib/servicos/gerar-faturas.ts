import "server-only";
import { and, eq, inArray } from "drizzle-orm";

import { db, contratos, contratosPrecos, faturas } from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
import { deveGerarFatura, montarFatura } from "@/lib/dominio/faturas";
import { precoVigente } from "@/lib/dominio/preco";

/**
 * Gera as faturas de uma competência para todos os contratos recorrentes
 * ativos. Idempotente: roda todo dia; quem já tem fatura na competência é
 * pulado (garantido também pelo UNIQUE contrato+competência no banco).
 */
export async function gerarFaturasDaCompetencia(
  competencia: string
): Promise<{ criadas: number; puladas: number; semPreco: string[] }> {
  const candidatos = await db
    .select()
    .from(contratos)
    .where(and(eq(contratos.tipo, "recorrente"), eq(contratos.status, "ativo")));

  if (candidatos.length === 0) return { criadas: 0, puladas: 0, semPreco: [] };

  const existentes = await db
    .select({ contratoId: faturas.contratoId })
    .from(faturas)
    .where(
      and(
        inArray(
          faturas.contratoId,
          candidatos.map((c) => c.id)
        ),
        eq(faturas.competencia, competencia)
      )
    );
  const jaTem = new Set(existentes.map((e) => e.contratoId));

  const vigencias = await db
    .select()
    .from(contratosPrecos)
    .where(
      inArray(
        contratosPrecos.contratoId,
        candidatos.map((c) => c.id)
      )
    );

  let criadas = 0;
  let puladas = 0;
  const semPreco: string[] = [];

  for (const contrato of candidatos) {
    if (!deveGerarFatura(contrato, competencia, jaTem.has(contrato.id))) {
      puladas++;
      continue;
    }

    const valor = precoVigente(
      vigencias
        .filter((v) => v.contratoId === contrato.id)
        .map((v) => ({ valorCentavos: v.valorCentavos, vigenteDesde: v.vigenteDesde })),
      competencia
    );

    if (valor == null) {
      // Contrato sem vigência aplicável: não inventar valor — sinalizar
      semPreco.push(contrato.id);
      continue;
    }

    const nova = montarFatura(contrato, competencia, valor);

    await db
      .insert(faturas)
      .values({
        contratoId: contrato.id,
        clienteId: contrato.clienteId,
        competencia: nova.competencia,
        vencimento: nova.vencimento,
        valorCentavos: nova.valorCentavos,
      })
      .onConflictDoNothing();

    await registrarAuditoria({
      ator: "sistema",
      acao: "fatura.gerada",
      entidade: "fatura",
      entidadeId: contrato.id,
      // clienteId nos detalhes: a timeline do cliente filtra por ele
      detalhes: {
        clienteId: contrato.clienteId,
        competencia,
        valorCentavos: valor,
        contratoId: contrato.id,
      },
    });

    criadas++;
  }

  return { criadas, puladas, semPreco };
}
