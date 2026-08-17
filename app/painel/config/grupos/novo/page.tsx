import { exigirPermissao } from "@/lib/auth";
import { salvarGrupo } from "@/app/painel/config/actions";
import { permissoesPorArea } from "@/lib/dominio/permissoes";
import { FormGrupo } from "@/components/painel/form-grupo";
import { PageHeader } from "@/components/painel/page-header";

export const metadata = { title: "Novo grupo" };

export default async function PaginaNovoGrupo() {
  await exigirPermissao("plataforma.grupos");

  return (
    <>
      <PageHeader titulo="Novo grupo" />
      <FormGrupo acao={salvarGrupo.bind(null, null)} areas={permissoesPorArea()} />
    </>
  );
}
