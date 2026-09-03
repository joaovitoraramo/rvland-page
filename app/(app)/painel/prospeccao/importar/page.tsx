import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { exigirPermissao } from "@/lib/auth";
import { importarPlanilha } from "../actions";
import { PageHeader } from "@/components/painel/page-header";
import { FormImportarProspeccao } from "@/components/painel/form-importar-prospeccao";
import { Btn } from "@/components/painel/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Importar prospecção" };

export default async function PaginaImportar() {
  await exigirPermissao("prospeccao.importar");

  return (
    <>
      <PageHeader
        trilha="prospecção / importar"
        titulo="Importar planilha"
        descricao="Sobe o CSV da varredura. Reimportar é seguro: atualiza o diagnóstico e preserva status e notas."
        acoes={
          <Btn asChild variante="fantasma">
            <Link href="/painel/prospeccao">
              <ArrowLeft className="size-4" /> Voltar
            </Link>
          </Btn>
        }
      />

      <div className="rv-entrar-1 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-white">Arquivo CSV</CardTitle>
          </CardHeader>
          <CardContent>
            <FormImportarProspeccao acao={importarPlanilha} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-white">Como funciona</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-white/60">
            <p>
              O arquivo é o{" "}
              <code className="rv-num text-white/80">prospeccao/planilha-leads.csv</code> gerado
              pela varredura.
            </p>
            <p>
              A chave é o domínio do site. Se ele já existe, o registro é atualizado com o
              diagnóstico novo, e{" "}
              <strong className="text-white/85">status, notas e datas continuam intocados</strong>.
            </p>
            <p>Colunas obrigatórias: site, negocio, potencial e nota_site.</p>
            <p className="border-t border-white/8 pt-3 text-white/45">
              Os prints dos sites são publicados à parte, com{" "}
              <code className="rv-num text-white/70">npx tsx scripts/subir-prints.ts</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
