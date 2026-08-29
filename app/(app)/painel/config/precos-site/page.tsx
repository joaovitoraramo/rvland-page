import { exigirPermissao } from "@/lib/auth";
import { getPricingEn } from "@/lib/config";
import { salvarPrecosSite } from "./actions";
import { PageHeader } from "@/components/painel/page-header";
import { FormPrecosSite } from "@/components/painel/form-precos-site";

export const metadata = { title: "Preços do site" };

export default async function PaginaPrecosSite() {
  await exigirPermissao("site.precos");
  const pricing = await getPricingEn();

  return (
    <>
      <PageHeader
        trilha="config / preços do site"
        titulo="Preços do site (/en)"
        descricao="O que o público internacional vê na seção de pricing. Salvar publica na hora."
      />
      <div className="rv-entrar-1">
        <FormPrecosSite acao={salvarPrecosSite} atual={pricing} />
      </div>
    </>
  );
}
