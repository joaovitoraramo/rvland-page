import { exigirPermissao } from "@/lib/auth";
import { criarCliente } from "@/app/painel/clientes/actions";
import { FormCliente } from "@/components/painel/form-cliente";
import { PageHeader } from "@/components/painel/page-header";

export const metadata = { title: "Novo cliente" };

export default async function PaginaNovoCliente() {
  await exigirPermissao("clientes.criar");

  return (
    <>
      <PageHeader
        trilha="clientes / novo"
        titulo="Novo cliente"
        descricao="Cadastro básico; contratos vêm depois."
      />
      <div className="rv-entrar-1">
        <FormCliente acao={criarCliente} rotuloEnviar="Cadastrar cliente" />
      </div>
    </>
  );
}
