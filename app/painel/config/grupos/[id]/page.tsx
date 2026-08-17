import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db, grupos, gruposPermissoes } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { salvarGrupo } from "@/app/painel/config/actions";
import { permissoesPorArea } from "@/lib/dominio/permissoes";
import { FormGrupo } from "@/components/painel/form-grupo";
import { PageHeader } from "@/components/painel/page-header";

export const metadata = { title: "Editar grupo" };

export default async function PaginaEditarGrupo({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermissao("plataforma.grupos");
  const { id } = await params;

  const [grupo] = await db.select().from(grupos).where(eq(grupos.id, id));
  if (!grupo) notFound();
  if (grupo.todasPermissoes) redirect("/painel/config/grupos");

  const permissoes = await db
    .select({ permissao: gruposPermissoes.permissao })
    .from(gruposPermissoes)
    .where(eq(gruposPermissoes.grupoId, id));

  return (
    <>
      <PageHeader titulo={`Editar grupo — ${grupo.nome}`} />
      <FormGrupo
        acao={salvarGrupo.bind(null, id)}
        inicial={{
          nome: grupo.nome,
          descricao: grupo.descricao,
          permissoes: permissoes.map((p) => p.permissao),
        }}
        areas={permissoesPorArea()}
      />
    </>
  );
}
