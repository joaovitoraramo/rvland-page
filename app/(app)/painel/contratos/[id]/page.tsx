import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { ArrowUpRight, FileX2 } from "lucide-react";

import { db, clientes, contratos, contratosPrecos, faturas } from "@/lib/db";
import { exigirPermissao, pode } from "@/lib/auth";
import { encerrarContrato, novaVigenciaPreco } from "@/app/(app)/painel/contratos/actions";
import { PageHeader } from "@/components/painel/page-header";
import { FormVigencia } from "@/components/painel/form-vigencia";
import { Btn } from "@/components/painel/ui";
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
  competenciaAtual,
  formatarCompetenciaBR,
  formatarDataBR,
} from "@/lib/dominio/tempo";
import { precoVigente } from "@/lib/dominio/preco";

export const metadata = { title: "Contrato" };

function proximasCompetencias(qtd: number): { valor: string; rotulo: string }[] {
  const [anoStr, mesStr] = competenciaAtual().split("-");
  let ano = Number(anoStr);
  let mes = Number(mesStr);
  const lista: { valor: string; rotulo: string }[] = [];
  for (let i = 0; i < qtd; i++) {
    const valor = `${ano}-${String(mes).padStart(2, "0")}-01`;
    lista.push({ valor, rotulo: formatarCompetenciaBR(valor) });
    mes++;
    if (mes > 12) {
      mes = 1;
      ano++;
    }
  }
  return lista;
}

export default async function PaginaContrato({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const perfil = await exigirPermissao("contratos.ver");
  const { id } = await params;

  const [contrato] = await db.select().from(contratos).where(eq(contratos.id, id));
  if (!contrato) notFound();

  const [cliente] = await db
    .select()
    .from(clientes)
    .where(eq(clientes.id, contrato.clienteId));

  const vigencias = await db
    .select()
    .from(contratosPrecos)
    .where(eq(contratosPrecos.contratoId, id))
    .orderBy(asc(contratosPrecos.vigenteDesde));

  const faturasDoContrato = await db
    .select()
    .from(faturas)
    .where(eq(faturas.contratoId, id))
    .orderBy(desc(faturas.competencia))
    .limit(12);

  const valorAtual = precoVigente(
    vigencias.map((v) => ({ valorCentavos: v.valorCentavos, vigenteDesde: v.vigenteDesde })),
    competenciaAtual()
  );

  const acaoVigencia = novaVigenciaPreco.bind(null, contrato.id);
  const acaoEncerrar = encerrarContrato.bind(null, contrato.id);

  return (
    <>
      <PageHeader
        trilha="contratos"
        titulo={contrato.titulo}
        descricao={`${cliente?.nome ?? ""} — início ${formatarDataBR(contrato.inicio)}${
          contrato.fim ? ` · fim ${formatarDataBR(contrato.fim)}` : ""
        }`}
        acoes={
          <>
            <span className="rv-eyebrow rounded-full border border-white/12 px-3 py-1.5">
              {contrato.tipo === "recorrente" ? "recorrente" : "fechado"}
            </span>
            <span
              className={`rv-eyebrow rounded-full border px-3 py-1.5 ${
                contrato.status === "ativo"
                  ? "border-[rgba(0,255,138,0.25)] !text-[#7DFFC4]"
                  : "border-white/12 !text-white/40"
              }`}
            >
              {contrato.status === "ativo" ? "ativo" : "encerrado"}
            </span>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rv-entrar-1">
          <CardHeader>
            <CardTitle className="text-base text-white">Dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {contrato.descricao ? <p className="text-white/65">{contrato.descricao}</p> : null}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                <div className="rv-eyebrow">valor vigente</div>
                <div className="rv-num rv-fosforo-ciano mt-1.5 text-lg font-semibold">
                  {valorAtual != null ? formatarReais(valorAtual) : "—"}
                </div>
                {contrato.tipo === "recorrente" ? (
                  <div className="mt-0.5 text-[11px] text-white/35">por mês</div>
                ) : null}
              </div>
              {contrato.tipo === "recorrente" ? (
                <>
                  <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                    <div className="rv-eyebrow">vencimento</div>
                    <div className="rv-num mt-1.5 text-lg font-semibold text-white/90">
                      dia {contrato.diaVencimento}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                    <div className="rv-eyebrow">tolerância</div>
                    <div className="rv-num mt-1.5 text-lg font-semibold text-white/90">
                      {contrato.toleranciaDias} dias
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {contrato.status === "ativo" && pode(perfil, "contratos.encerrar") ? (
              <form action={acaoEncerrar} className="border-t border-white/8 pt-4">
                <Btn type="submit" variante="perigo">
                  <FileX2 className="size-4" />
                  Encerrar contrato
                </Btn>
                <p className="mt-2 text-xs text-white/35">
                  Para de gerar faturas; cliente recorrente vira Cancelado.
                </p>
              </form>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rv-entrar-2">
          <CardHeader>
            <CardTitle className="text-base text-white">Vigências de preço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Desde</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Por</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vigencias.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell rotulo="desde" className="rv-num">{formatarCompetenciaBR(v.vigenteDesde)}</TableCell>
                    <TableCell rotulo="valor" className="rv-num text-right">
                      {formatarReais(v.valorCentavos)}
                    </TableCell>
                    <TableCell rotulo="por" className="text-white/45">{v.criadoPor}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {contrato.status === "ativo" &&
            contrato.tipo === "recorrente" &&
            pode(perfil, "financeiro.alterar_preco") ? (
              <FormVigencia acao={acaoVigencia} competencias={proximasCompetencias(12)} />
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="rv-entrar-3 mt-4">
        <CardHeader>
          <CardTitle className="text-base text-white">Últimas faturas</CardTitle>
        </CardHeader>
        <CardContent>
          {faturasDoContrato.length === 0 ? (
            <p className="text-sm text-white/40">Nenhuma fatura ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competência</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {faturasDoContrato.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell rotulo="competência" className="rv-num">
                      {formatarCompetenciaBR(f.competencia)}
                      {f.historica ? (
                        <span className="ml-2 font-sans text-xs text-white/30">hist.</span>
                      ) : null}
                    </TableCell>
                    <TableCell rotulo="vencimento" className="rv-num">{formatarDataBR(f.vencimento)}</TableCell>
                    <TableCell rotulo="valor" className="rv-num text-right">
                      {formatarReais(f.valorCentavos)}
                    </TableCell>
                    <TableCell
                      rotulo="situação"
                      className={
                        f.status === "quitada"
                          ? "text-[#7DFFC4]"
                          : f.status === "cancelada"
                            ? "text-white/35"
                            : "text-[#FFD58A]"
                      }
                    >
                      {f.status === "quitada"
                        ? "Quitada"
                        : f.status === "cancelada"
                          ? "Cancelada"
                          : "Aberta"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Btn asChild tamanho="sm" className="max-md:w-full">
                        <Link href={`/painel/financeiro/faturas/${f.id}`}>
                          Abrir
                          <ArrowUpRight className="size-3.5" />
                        </Link>
                      </Btn>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
