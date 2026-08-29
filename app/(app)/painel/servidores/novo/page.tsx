import { asc, eq } from "drizzle-orm";

import { db, clientes } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { SITE_URL } from "@/lib/site";
import { FormServidor } from "@/components/painel/form-servidor";
import { PageHeader } from "@/components/painel/page-header";

export const metadata = { title: "Novo servidor" };

export default async function PaginaNovoServidor({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  await exigirPermissao("servidores.cadastrar");
  const { cliente } = await searchParams;

  const lista = await db
    .select({ id: clientes.id, nome: clientes.nome })
    .from(clientes)
    .where(eq(clientes.status, "ativo"))
    .orderBy(asc(clientes.nome));

  return (
    <>
      <PageHeader
        trilha="servidores / novo"
        titulo="Novo servidor"
        descricao="Ao cadastrar, geramos o token e o comando de instalação do agente."
      />
      <div className="rv-entrar-1">
        <FormServidor clientes={lista} clientePreset={cliente} siteUrl={SITE_URL} />
      </div>
    </>
  );
}
