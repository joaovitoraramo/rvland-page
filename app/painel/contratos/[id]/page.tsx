import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";

import { db, clientes, contratos, contratosPrecos, faturas } from "@/lib/db";
import { exigirPermissao, pode } from "@/lib/auth";
import {
  encerrarContrato,
  novaVigenciaPreco,
} from "@/app/painel/contratos/actions";
import { PageHeader } from "@/components/painel/page-header";
import { FormVigencia } from "@/components/painel/form-vigencia";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
        titulo={contrato.titulo}
        descricao={`${cliente?.nome ?? ""} — início ${formatarDataBR(contrato.inicio)}${
          contrato.fim ? ` · fim ${formatarDataBR(contrato.fim)}` : ""
        }`}
        acoes={
          <>
            <Badge className="border-white/10 bg-white/5 text-white/70">
              {contrato.tipo === "recorrente" ? "Recorrente" : "Fechado"}
            </Badge>
            <Badge
              className={
                contrato.status === "ativo"
                  ? "border-[rgba(0,255,138,0.25)] bg-[rgba(0,255,138,0.10)] text-[rgba(150,255,200,0.95)]"
                  : "border-white/15 bg-white/5 text-white/55"
              }
            >
              {contrato.status === "ativo" ? "Ativo" : "Encerrado"}
            </Badge>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-base text-white">Dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-white/75">
            {contrato.descricao ? <p>{contrato.descricao}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-white/45">Valor vigente</div>
                <div className="text-lg font-semibold text-white">
                  {valorAtual != null ? formatarReais(valorAtual) : "—"}
                  {contrato.tipo === "recorrente" ? (
                    <span className="text-xs font-normal text-white/45"> /mês</span>
                  ) : null}
                </div>
              </div>
              {contrato.tipo === "recorrente" ? (
                <>
                  <div>
                    <div className="text-xs text-white/45">Vencimento</div>
                    <div className="text-white/85">dia {contrato.diaVencimento}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/45">Tolerância</div>
                    <div className="text-white/85">{contrato.toleranciaDias} dias</div>
                  </div>
                </>
              ) : null}
            </div>

            {contrato.status === "ativo" && pode(perfil, "contratos.encerrar") ? (
              <form
                action={acaoEncerrar}
                className="mt-4 border-t border-white/10 pt-4"
              >
                <Button
                  type="submit"
                  variant="destructive"
                  className="rounded-xl bg-red-500/15 text-red-200 hover:bg-red-500/25"
                >
                  Encerrar contrato
                </Button>
                <p className="mt-1 text-xs text-white/40">
                  Para de gerar faturas; cliente recorrente vira Cancelado.
                </p>
              </form>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-base text-white">Vigências de preço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Desde</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Por</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vigencias.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>{formatarCompetenciaBR(v.vigenteDesde)}</TableCell>
                    <TableCell>{formatarReais(v.valorCentavos)}</TableCell>
                    <TableCell className="text-white/50">{v.criadoPor}</TableCell>
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

      <Card className="mt-4 rounded-2xl border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-base text-white">Últimas faturas</CardTitle>
        </CardHeader>
        <CardContent>
          {faturasDoContrato.length === 0 ? (
            <p className="text-sm text-white/45">Nenhuma fatura ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competência</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {faturasDoContrato.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <Link
                        href={`/painel/financeiro/faturas/${f.id}`}
                        className="hover:underline"
                      >
                        {formatarCompetenciaBR(f.competencia)}
                      </Link>
                      {f.historica ? (
                        <span className="ml-2 text-xs text-white/40">(histórica)</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{formatarDataBR(f.vencimento)}</TableCell>
                    <TableCell>{formatarReais(f.valorCentavos)}</TableCell>
                    <TableCell className="text-white/60">
                      {f.status === "quitada"
                        ? "Quitada"
                        : f.status === "cancelada"
                          ? "Cancelada"
                          : "Aberta"}
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
