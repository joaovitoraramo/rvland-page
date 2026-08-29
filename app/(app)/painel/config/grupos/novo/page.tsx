import { exigirPermissao } from "@/lib/auth";
import { salvarGrupo } from "@/app/(app)/painel/config/actions";
import { permissoesPorArea } from "@/lib/dominio/permissoes";
import { FormGrupo } from "@/components/painel/form-grupo";
import { PageHeader } from "@/components/painel/page-header";

export const metadata = { title: "Novo grupo" };

export default async function PaginaNovoGrupo() {
  await exigirPermissao("plataforma.grupos");

  return (
    <>
      <PageHeader trilha="config / grupos / novo" titulo="Novo grupo" />
      <div className="rv-entrar-1">
      <FormGrupo acao={salvarGrupo.bind(null, null)} areas={permissoesPorArea()} />
      </div>
    </>
  );
}
