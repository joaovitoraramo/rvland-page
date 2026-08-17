import { asc } from "drizzle-orm";

import { db, grupos } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { FormUsuario } from "@/components/painel/form-usuario";
import { PageHeader } from "@/components/painel/page-header";

export const metadata = { title: "Novo usuário" };

export default async function PaginaNovoUsuario() {
  await exigirPermissao("plataforma.usuarios");

  const lista = await db.select().from(grupos).orderBy(asc(grupos.nome));

  return (
    <>
      <PageHeader titulo="Novo usuário" descricao="Cria no Supabase Auth e vincula ao grupo." />
      <FormUsuario gruposDisponiveis={lista.map((g) => ({ id: g.id, nome: g.nome }))} />
    </>
  );
}
