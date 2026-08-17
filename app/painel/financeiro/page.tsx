import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowUpRight, Plus, Receipt } from "lucide-react";

import { db, clientes, contratos, faturas } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { PageHeader } from "@/components/painel/page-header";
import { Btn, EmptyState } from "@/components/painel/ui";
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

function situacaoDe(
  f: { status: string; vencimento: string; historica: boolean },
  hoje: string
): Situacao {
  if (f.historica) return "historica";
  if (f.status === "quitada") return "quitada";
  if (f.status === "cancelada") return "cancelada";
  if (f.vencimento < hoje) return "vencida";
  return "aberta";
}

const ROTULOS: Record<Situacao, { texto: string; classe: string }> = {
  aberta: { texto: "Aberta", classe: "text-white/70" },
  vencida: { texto: "Vencida", classe: "text-[#FFD58A]" },
  quitada: { texto: "Quitada", classe: "text-[#7DFFC4]" },
  cancelada: { texto: "Cancelada", classe: "text-white/35" },
  historica: { texto: "Histórica", classe: "text-white/35" },
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
        trilha="financeiro"
        titulo="Financeiro"
        descricao="Faturas geradas pelo cron e lançadas manualmente."
        acoes={
          <Btn asChild variante="primario">
            <Link href="/painel/financeiro/faturas/nova">
              <Plus className="size-4" /> Nova fatura
            </Link>
          </Btn>
        }
      />

      <div className="rv-entrar-1 mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3 md:gap-3">
        {[
          { rotulo: "recebido (filtro atual)", valor: totais.recebido, classe: "rv-fosforo-verde" },
          { rotulo: "em aberto", valor: totais.aAberta, classe: "text-white" },
          {
            rotulo: "vencido",
            valor: totais.vencido,
            classe: totais.vencido > 0 ? "rv-fosforo-ambar" : "text-white/50",
          },
        ].map((t) => (
          <div
            key={t.rotulo}
            className="rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.055] to-white/[0.028] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          >
            <div className="rv-eyebrow">{t.rotulo}</div>
            <div className={`rv-num mt-2.5 text-[22px] font-semibold leading-none ${t.classe}`}>
              {formatarReais(t.valor)}
            </div>
          </div>
        ))}
      </div>

      <form className="rv-entrar-2 mb-5 flex flex-wrap items-center gap-2" action="/painel/financeiro">
        <select name="competencia" defaultValue={filtroCompetencia ?? ""} className="!w-full sm:!w-52">
          <option value="">Todas as competências</option>
          {competencias.map((c) => (
            <option key={c} value={c}>
              {formatarCompetenciaBR(c)}
            </option>
          ))}
        </select>
        <select name="situacao" defaultValue={filtroSituacao ?? ""} className="!w-full sm:!w-48">
          <option value="">Todas as situações</option>
          <option value="aberta">Abertas</option>
          <option value="vencida">Vencidas</option>
          <option value="quitada">Quitadas</option>
          <option value="cancelada">Canceladas</option>
          <option value="historica">Históricas</option>
        </select>
        <Btn type="submit" className="max-sm:w-full">Filtrar</Btn>
      </form>

      <div className="rv-entrar-3">
        {filtradas.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
            <EmptyState
              icone={<Receipt />}
              titulo="Nenhuma fatura no filtro"
              dica="Ajuste os filtros ou lance uma nova fatura."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competência</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Contrato</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => {
                const s = situacaoDe(l.fatura, hoje);
                return (
                  <TableRow key={l.fatura.id}>
                    <TableCell rotulo="competência" className="rv-num font-medium text-white">
                      {formatarCompetenciaBR(l.fatura.competencia)}
                    </TableCell>
                    <TableCell rotulo="cliente" className="text-white/70">{l.clienteNome}</TableCell>
                    <TableCell rotulo="contrato" className="text-white/55">{l.contratoTitulo}</TableCell>
                    <TableCell rotulo="vencimento" className="rv-num text-white/70">
                      {formatarDataBR(l.fatura.vencimento)}
                    </TableCell>
                    <TableCell rotulo="valor" className="rv-num text-right">
                      {formatarReais(l.fatura.valorCentavos)}
                    </TableCell>
                    <TableCell rotulo="situação" className={ROTULOS[s].classe}>{ROTULOS[s].texto}</TableCell>
                    <TableCell className="text-right">
                      <Btn asChild tamanho="sm" className="max-md:w-full">
                        <Link href={`/painel/financeiro/faturas/${l.fatura.id}`}>
                          Abrir
                          <ArrowUpRight className="size-3.5" />
                        </Link>
                      </Btn>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
