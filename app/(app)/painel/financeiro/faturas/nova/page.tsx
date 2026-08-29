import { eq } from "drizzle-orm";

import { db, clientes, contratos } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { PageHeader } from "@/components/painel/page-header";
import { FormFaturaManual } from "@/components/painel/form-fatura-manual";

export const metadata = { title: "Nova fatura" };

export default async function PaginaNovaFatura() {
  await exigirPermissao("financeiro.editar_cobranca");

  const linhas = await db
    .select({
      id: contratos.id,
      titulo: contratos.titulo,
      tipo: contratos.tipo,
      diaVencimento: contratos.diaVencimento,
      clienteNome: clientes.nome,
    })
    .from(contratos)
    .innerJoin(clientes, eq(clientes.id, contratos.clienteId));

  const contratosDisponiveis = linhas.map((l) => ({
    id: l.id,
    cliente: l.clienteNome,
    titulo: l.titulo,
    tipo: l.tipo,
    diaVencimento: l.diaVencimento,
  }));

  return (
    <>
      <PageHeader
        trilha="financeiro / nova fatura"
        titulo="Nova fatura"
        descricao="Avulsa, parcela de contrato fechado, ou lançamento de histórico."
      />
      <FormFaturaManual contratosDisponiveis={contratosDisponiveis} />
    </>
  );
}
