import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db, clientes, contratos, faturas, pagamentos } from "@/lib/db";
import { exigirPermissao, pode } from "@/lib/auth";
import {
  cancelarFatura,
  editarFatura,
  lancarPagamento,
} from "@/app/painel/financeiro/actions";
import { PageHeader } from "@/components/painel/page-header";
import { FormPagamento } from "@/components/painel/form-pagamento";
import { FormEditarFatura } from "@/components/painel/form-editar-fatura";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarReais } from "@/lib/formato";
import {
  formatarCompetenciaBR,
  formatarDataBR,
  hojeSP,
} from "@/lib/dominio/tempo";

export const metadata = { title: "Fatura" };

export default async function PaginaFatura({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const perfil = await exigirPermissao("financeiro.ver");
  const { id } = await params;

  const [fatura] = await db.select().from(faturas).where(eq(faturas.id, id));
  if (!fatura) notFound();

  const [[cliente], [contrato], listaPagamentos] = await Promise.all([
    db.select().from(clientes).where(eq(clientes.id, fatura.clienteId)),
    db.select().from(contratos).where(eq(contratos.id, fatura.contratoId)),
    db
      .select()
      .from(pagamentos)
      .where(eq(pagamentos.faturaId, id))
      .orderBy(asc(pagamentos.criadoEm)),
  ]);

  const restante = fatura.valorCentavos - fatura.pagoCentavos;
  const restanteFormatado = (restante / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
  });
  const valorFormatado = (fatura.valorCentavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
  });

  const acaoPagar = lancarPagamento.bind(null, fatura.id);
  const acaoEditar = editarFatura.bind(null, fatura.id);
  const acaoCancelar = cancelarFatura.bind(null, fatura.id);

  return (
    <>
      <PageHeader
        titulo={`Fatura ${formatarCompetenciaBR(fatura.competencia)} — ${cliente?.nome ?? ""}`}
        descricao={contrato?.titulo}
        acoes={
          <>
            {fatura.historica ? (
              <Badge className="border-white/15 bg-white/5 text-white/55">Histórica</Badge>
            ) : null}
            <Badge
              className={
                fatura.status === "quitada"
                  ? "border-[rgba(0,255,138,0.25)] bg-[rgba(0,255,138,0.10)] text-[rgba(150,255,200,0.95)]"
                  : fatura.status === "cancelada"
                    ? "border-white/15 bg-white/5 text-white/55"
                    : "border-amber-400/25 bg-amber-400/10 text-amber-200"
              }
            >
              {fatura.status === "quitada"
                ? "Quitada"
                : fatura.status === "cancelada"
                  ? "Cancelada"
                  : "Aberta"}
            </Badge>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="rounded-2xl border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-base text-white">Resumo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-xs text-white/45">Valor</div>
                  <div className="font-semibold text-white">{formatarReais(fatura.valorCentavos)}</div>
                </div>
                <div>
                  <div className="text-xs text-white/45">Pago</div>
                  <div className="font-semibold text-emerald-300">{formatarReais(fatura.pagoCentavos)}</div>
                </div>
                <div>
                  <div className="text-xs text-white/45">Restante</div>
                  <div className="font-semibold text-white">{formatarReais(restante)}</div>
                </div>
                <div>
                  <div className="text-xs text-white/45">Vencimento</div>
                  <div className="font-semibold text-white">{formatarDataBR(fatura.vencimento)}</div>
                </div>
              </div>
              {fatura.notas ? (
                <p className="mt-3 border-t border-white/10 pt-3 text-sm text-white/60">{fatura.notas}</p>
              ) : null}
              <p className="mt-3 text-xs text-white/40">
                Cliente:{" "}
                <Link href={`/painel/clientes/${fatura.clienteId}`} className="text-white/70 hover:underline">
                  {cliente?.nome}
                </Link>
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-base text-white">Pagamentos lançados</CardTitle>
            </CardHeader>
            <CardContent>
              {listaPagamentos.length === 0 ? (
                <p className="text-sm text-white/45">Nenhum pagamento ainda.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Forma</TableHead>
                      <TableHead>Por</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listaPagamentos.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{formatarDataBR(p.pagoEm)}</TableCell>
                        <TableCell>{formatarReais(p.valorCentavos)}</TableCell>
                        <TableCell className="text-white/60">{p.forma ?? "—"}</TableCell>
                        <TableCell className="text-white/50">{p.criadoPor}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {fatura.status === "aberta" && pode(perfil, "financeiro.lancar_pagamento") ? (
            <Card className="rounded-2xl border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="text-base text-white">Lançar pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                <FormPagamento acao={acaoPagar} valorRestante={restanteFormatado} hoje={hojeSP()} />
                {!fatura.historica ? (
                  <p className="mt-3 text-xs text-white/40">
                    Quitação integral renova a licença automaticamente (auditado).
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {fatura.status === "aberta" && pode(perfil, "financeiro.editar_cobranca") ? (
            <Card className="rounded-2xl border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="text-base text-white">Editar / cancelar</CardTitle>
              </CardHeader>
              <CardContent>
                <FormEditarFatura
                  acaoEditar={acaoEditar}
                  acaoCancelar={acaoCancelar}
                  vencimento={fatura.vencimento}
                  valor={valorFormatado}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
