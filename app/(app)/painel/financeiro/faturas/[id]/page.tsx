import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db, clientes, contratos, faturas, pagamentos } from "@/lib/db";
import { exigirPermissao, pode } from "@/lib/auth";
import {
  cancelarFatura,
  editarFatura,
  lancarPagamento,
} from "@/app/(app)/painel/financeiro/actions";
import { PageHeader } from "@/components/painel/page-header";
import { FormPagamento } from "@/components/painel/form-pagamento";
import { FormEditarFatura } from "@/components/painel/form-editar-fatura";
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
import { formatarCompetenciaBR, formatarDataBR, hojeSP } from "@/lib/dominio/tempo";

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

  const resumo = [
    { rotulo: "valor", valor: formatarReais(fatura.valorCentavos), classe: "text-white" },
    {
      rotulo: "pago",
      valor: formatarReais(fatura.pagoCentavos),
      classe: fatura.pagoCentavos > 0 ? "rv-fosforo-verde" : "text-white/50",
    },
    {
      rotulo: "restante",
      valor: formatarReais(restante),
      classe: restante > 0 ? "rv-fosforo-ambar" : "text-white/50",
    },
    { rotulo: "vencimento", valor: formatarDataBR(fatura.vencimento), classe: "text-white" },
  ];

  return (
    <>
      <PageHeader
        trilha="financeiro / fatura"
        titulo={`${formatarCompetenciaBR(fatura.competencia)} — ${cliente?.nome ?? ""}`}
        descricao={contrato?.titulo}
        acoes={
          <>
            {fatura.historica ? (
              <span className="rv-eyebrow rounded-full border border-white/12 px-3 py-1.5">
                histórica
              </span>
            ) : null}
            <span
              className={`rv-eyebrow rounded-full border px-3 py-1.5 ${
                fatura.status === "quitada"
                  ? "border-[rgba(0,255,138,0.25)] !text-[#7DFFC4]"
                  : fatura.status === "cancelada"
                    ? "border-white/12 !text-white/40"
                    : "border-[rgba(255,194,77,0.3)] !text-[#FFD58A]"
              }`}
            >
              {fatura.status === "quitada"
                ? "quitada"
                : fatura.status === "cancelada"
                  ? "cancelada"
                  : "aberta"}
            </span>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rv-entrar-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-white">Resumo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {resumo.map((r) => (
                  <div key={r.rotulo} className="rounded-xl border border-white/8 bg-black/25 p-3">
                    <div className="rv-eyebrow">{r.rotulo}</div>
                    <div className={`rv-num mt-1.5 text-sm font-semibold ${r.classe}`}>
                      {r.valor}
                    </div>
                  </div>
                ))}
              </div>
              {fatura.notas ? (
                <p className="mt-4 border-t border-white/8 pt-3 text-sm text-white/55">
                  {fatura.notas}
                </p>
              ) : null}
              <p className="mt-3 text-xs text-white/35">
                Cliente:{" "}
                <Link
                  href={`/painel/clientes/${fatura.clienteId}`}
                  className="text-white/60 hover:text-[#8AF0FF]"
                >
                  {cliente?.nome}
                </Link>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base text-white">Pagamentos lançados</CardTitle>
            </CardHeader>
            <CardContent>
              {listaPagamentos.length === 0 ? (
                <p className="text-sm text-white/40">Nenhum pagamento ainda.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Forma</TableHead>
                      <TableHead>Por</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listaPagamentos.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell rotulo="data" className="rv-num">{formatarDataBR(p.pagoEm)}</TableCell>
                        <TableCell rotulo="valor" className="rv-num text-right">
                          {formatarReais(p.valorCentavos)}
                        </TableCell>
                        <TableCell rotulo="forma" className="text-white/55">{p.forma ?? "—"}</TableCell>
                        <TableCell rotulo="por" className="text-white/45">{p.criadoPor}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="rv-entrar-2 space-y-4">
          {fatura.status === "aberta" && pode(perfil, "financeiro.lancar_pagamento") ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-white">Lançar pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                <FormPagamento acao={acaoPagar} valorRestante={restanteFormatado} hoje={hojeSP()} />
                {!fatura.historica ? (
                  <p className="mt-3 text-xs text-white/35">
                    Quitação integral renova a licença automaticamente (auditado).
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {fatura.status === "aberta" && pode(perfil, "financeiro.editar_cobranca") ? (
            <Card>
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
