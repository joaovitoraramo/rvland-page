import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db, clientes } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { FormContrato } from "@/components/painel/form-contrato";
import { PageHeader } from "@/components/painel/page-header";

export const metadata = { title: "Novo contrato" };

export default async function PaginaNovoContrato({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  await exigirPermissao("contratos.criar");
  const { cliente: clienteId } = await searchParams;
  if (!clienteId) notFound();

  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, clienteId));
  if (!cliente) notFound();

  return (
    <>
      <PageHeader
        titulo={`Novo contrato — ${cliente.nome}`}
        descricao="Recorrente gera fatura mensal e licença; fechado é só registro financeiro."
      />
      <FormContrato clienteId={cliente.id} />
    </>
  );
}
