import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowUpRight } from "lucide-react";

import { db, leads } from "@/lib/db";
import { exigirPermissao, pode } from "@/lib/auth";
import { atualizarLead } from "../actions";
import { PageHeader } from "@/components/painel/page-header";
import { BadgeLead } from "@/components/painel/badge-lead";
import { FormLead } from "@/components/painel/form-lead";
import { Btn } from "@/components/painel/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { linkContato, rotuloCanal } from "@/lib/dominio/leads";
import { formatarDataHoraBR } from "@/lib/formato";

export const metadata = { title: "Lead" };

export default async function PaginaLead({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const perfil = await exigirPermissao("leads.ver");
  const { id } = await params;

  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) notFound();

  const podeEditar = pode(perfil, "leads.editar");
  const acao = atualizarLead.bind(null, lead.id);

  const info = (rotulo: string, valor: React.ReactNode) => (
    <div>
      <div className="rv-eyebrow mb-1">{rotulo}</div>
      <div className="text-sm text-white/85">{valor}</div>
    </div>
  );

  return (
    <>
      <PageHeader
        trilha="leads / detalhe"
        titulo={lead.nome}
        descricao={lead.negocio ?? undefined}
        acoes={
          <Btn asChild variante="primario">
            <a href={linkContato(lead.canal, lead.contato)} target="_blank" rel="noreferrer">
              Abrir no {rotuloCanal[lead.canal]}
              <ArrowUpRight className="size-4" />
            </a>
          </Btn>
        }
      />

      <div className="rv-entrar-1 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base text-white">
              Dados do lead
              <BadgeLead status={lead.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {info(
              "origem",
              lead.origem === "en" ? "Exterior (/en)" : "Brasil (site PT)"
            )}
            {lead.conceito
              ? info(
                  "veio do conceito",
                  <a
                    href={`/c/${lead.conceito}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#8AF0FF] hover:underline"
                  >
                    /c/{lead.conceito}
                  </a>
                )
              : null}
            {info("canal preferido", rotuloCanal[lead.canal])}
            {info("contato", <span className="rv-num">{lead.contato}</span>)}
            {lead.siteAtual
              ? info(
                  "site atual",
                  <a
                    href={
                      lead.siteAtual.startsWith("http")
                        ? lead.siteAtual
                        : `https://${lead.siteAtual}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#8AF0FF] hover:underline"
                  >
                    {lead.siteAtual}
                  </a>
                )
              : null}
            {info(
              "recebido em",
              <span className="rv-num">{formatarDataHoraBR(lead.criadoEm)}</span>
            )}
            {info(
              "mensagem",
              <p className="whitespace-pre-wrap rounded-xl border border-white/8 bg-black/20 p-3 text-white/80">
                {lead.mensagem}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-white">Acompanhamento</CardTitle>
          </CardHeader>
          <CardContent>
            {podeEditar ? (
              <FormLead
                acao={acao}
                statusAtual={lead.status}
                notasAtuais={lead.notas ?? ""}
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-white/60">
                {lead.notas ?? "Sem notas."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
