import "server-only";
import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";

import { db, clientes, faturas } from "@/lib/db";
import { statusDeCliente } from "@/lib/consultas/licencas";
import { registrarPagamentoNaFatura } from "@/lib/servicos/registrar-pagamento";
import { hojeSP } from "@/lib/dominio/tempo";
import {
  distribuirPagamento,
  parseComandoFatura,
  respostaFatura,
} from "@/lib/dominio/telegram";

/** Executa /fatura vindo do webhook e devolve o texto de resposta ao chat. */
export async function executarComandoFatura(texto: string): Promise<string> {
  const parse = parseComandoFatura(texto);
  if (!parse.ok) return parse.erro;
  const { idCurto, valorCentavos, pagoEm } = parse.comando;

  const candidatos = await db
    .select({ id: clientes.id, nome: clientes.nome })
    .from(clientes)
    .where(sql`${clientes.id}::text like ${idCurto + "%"}`)
    .limit(3);

  if (candidatos.length === 0) {
    return `Nenhum cliente encontrado com id ${idCurto}.`;
  }
  if (candidatos.length > 1) {
    return `Mais de um cliente começa com ${idCurto} — use mais caracteres do id.`;
  }
  const cliente = candidatos[0];

  const abertas = await db
    .select({
      id: faturas.id,
      competencia: faturas.competencia,
      vencimento: faturas.vencimento,
      valorCentavos: faturas.valorCentavos,
      pagoCentavos: faturas.pagoCentavos,
    })
    .from(faturas)
    .where(
      and(
        eq(faturas.clienteId, cliente.id),
        eq(faturas.status, "aberta"),
        eq(faturas.historica, false)
      )
    )
    .orderBy(asc(faturas.vencimento));

  const { alocacoes, sobraCentavos } = distribuirPagamento(abertas, valorCentavos);
  if (alocacoes.length === 0) {
    return `${cliente.nome} não tem faturas em aberto — nada foi registrado.`;
  }

  const dataPagamento = pagoEm ?? hojeSP();
  for (const alocacao of alocacoes) {
    const resultado = await registrarPagamentoNaFatura({
      faturaId: alocacao.faturaId,
      valorCentavos: alocacao.valorCentavos,
      pagoEm: dataPagamento,
      criadoPor: "telegram",
      ator: "sistema",
      detalhesExtras: { via: "telegram" },
    });
    if (!resultado.ok) {
      return `Erro ao registrar em ${alocacao.competencia}: ${resultado.erro}`;
    }
  }

  revalidatePath(`/painel/clientes/${cliente.id}`);
  revalidatePath("/painel/financeiro");
  revalidatePath("/painel");

  const licenca = await statusDeCliente(cliente.id);
  return respostaFatura({
    clienteNome: cliente.nome,
    alocacoes,
    sobraCentavos,
    licenca,
  });
}
