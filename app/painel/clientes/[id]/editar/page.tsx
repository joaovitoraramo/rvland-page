import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db, clientes } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { atualizarCliente } from "@/app/painel/clientes/actions";
import { FormCliente } from "@/components/painel/form-cliente";
import { PageHeader } from "@/components/painel/page-header";

export const metadata = { title: "Editar cliente" };

export default async function PaginaEditarCliente({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermissao("clientes.editar");
  const { id } = await params;

  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, id));
  if (!cliente) notFound();

  const acao = atualizarCliente.bind(null, cliente.id);

  return (
    <>
      <PageHeader titulo={`Editar — ${cliente.nome}`} />
      <FormCliente acao={acao} inicial={cliente} rotuloEnviar="Salvar alterações" />
    </>
  );
}
