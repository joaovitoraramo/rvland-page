import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";

import { db, clientes, contratos, faturas } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { PageHeader } from "@/components/painel/page-header";
import { Button } from "@/components/ui/button";
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

export const metadata = { title: "Financeiro" };

type Situacao = "aberta" | "vencida" | "quitada" | "cancelada" | "historica";

function situacaoDe(f: {
  status: string;
  vencimento: string;
  historica: boolean;
}, hoje: string): Situacao {
  if (f.historica) return "historica";
  if (f.status === "quitada") return "quitada";
  if (f.status === "cancelada") return "cancelada";
  if (f.vencimento < hoje) return "vencida";
  return "aberta";
}

const ROTULOS: Record<Situacao, { texto: string; classe: string }> = {
  aberta: { texto: "Aberta", classe: "text-white/70" },
  vencida: { texto: "Vencida", classe: "text-amber-300" },
  quitada: { texto: "Quitada", classe: "text-emerald-300" },
  cancelada: { texto: "Cancelada", classe: "text-white/40" },
  historica: { texto: "Histórica", classe: "text-white/40" },
};

export default async function PaginaFinanceiro({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string; situacao?: string }>;
}) {
  await exigirPermissao("financeiro.ver");
  const { competencia: filtroCompetencia, situacao: filtroSituacao } = await searchParams;
  const hoje = hojeSP();

  const linhas = await db
    .select({
      fatura: faturas,
      clienteNome: clientes.nome,
      contratoTitulo: contratos.titulo,
    })
    .from(faturas)
    .innerJoin(clientes, eq(clientes.id, faturas.clienteId))
    .innerJoin(contratos, eq(contratos.id, faturas.contratoId))
    .orderBy(desc(faturas.competencia), desc(faturas.criadoEm))
    .limit(500);

  const competencias = [...new Set(linhas.map((l) => l.fatura.competencia))].sort().reverse();

  const filtradas = linhas.filter((l) => {
    if (filtroCompetencia && l.fatura.competencia !== filtroCompetencia) return false;
    if (filtroSituacao && situacaoDe(l.fatura, hoje) !== filtroSituacao) return false;
    return true;
  });

  const totais = filtradas.reduce(
    (acc, l) => {
      const s = situacaoDe(l.fatura, hoje);
      if (s === "quitada" || s === "historica") acc.recebido += l.fatura.pagoCentavos;
      if (s === "aberta") acc.aAberta += l.fatura.valorCentavos - l.fatura.pagoCentavos;
      if (s === "vencida") acc.vencido += l.fatura.valorCentavos - l.fatura.pagoCentavos;
      return acc;
    },
    { recebido: 0, aAberta: 0, vencido: 0 }
  );

  return (
    <>
      <PageHeader
        titulo="Financeiro"
        descricao="Faturas geradas pelo cron e lançadas manualmente."
        acoes={
          <Button asChild className="rounded-xl bg-[rgba(0,229,255,0.18)] text-white hover:bg-[rgba(0,229,255,0.26)]">
            <Link href="/painel/financeiro/faturas/nova">
              <Plus className="h-4 w-4" /> Nova fatura
            </Link>
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[
          { rotulo: "Recebido (filtro atual)", valor: totais.recebido, classe: "text-emerald-300" },
          { rotulo: "Em aberto", valor: totais.aAberta, classe: "text-white" },
          { rotulo: "Vencido", valor: totais.vencido, classe: "text-amber-300" },
        ].map((t) => (
          <div key={t.rotulo} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/50">{t.rotulo}</div>
            <div className={`mt-1 text-xl font-semibold ${t.classe}`}>{formatarReais(t.valor)}</div>
          </div>
        ))}
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2" action="/painel/financeiro">
        <select
          name="competencia"
          defaultValue={filtroCompetencia ?? ""}
          className="h-9 rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white [&>option]:bg-[#0a0e14]"
        >
          <option value="">Todas as competências</option>
          {competencias.map((c) => (
            <option key={c} value={c}>
              {formatarCompetenciaBR(c)}
            </option>
          ))}
        </select>
        <select
          name="situacao"
          defaultValue={filtroSituacao ?? ""}
          className="h-9 rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white [&>option]:bg-[#0a0e14]"
        >
          <option value="">Todas as situações</option>
          <option value="aberta">Abertas</option>
          <option value="vencida">Vencidas</option>
          <option value="quitada">Quitadas</option>
          <option value="cancelada">Canceladas</option>
          <option value="historica">Históricas</option>
        </select>
        <Button type="submit" variant="secondary" className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10">
          Filtrar
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Competência</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Contrato</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtradas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-white/45">
                Nenhuma fatura no filtro.
              </TableCell>
            </TableRow>
          ) : (
            filtradas.map((l) => {
              const s = situacaoDe(l.fatura, hoje);
              return (
                <TableRow key={l.fatura.id}>
                  <TableCell>
                    <Link href={`/painel/financeiro/faturas/${l.fatura.id}`} className="font-medium text-white hover:underline">
                      {formatarCompetenciaBR(l.fatura.competencia)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-white/70">{l.clienteNome}</TableCell>
                  <TableCell className="text-white/60">{l.contratoTitulo}</TableCell>
                  <TableCell className="text-white/70">{formatarDataBR(l.fatura.vencimento)}</TableCell>
                  <TableCell>{formatarReais(l.fatura.valorCentavos)}</TableCell>
                  <TableCell className={ROTULOS[s].classe}>{ROTULOS[s].texto}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </>
  );
}
