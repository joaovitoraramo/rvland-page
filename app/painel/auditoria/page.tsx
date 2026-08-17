import { desc, eq } from "drizzle-orm";

import { db, auditoria } from "@/lib/db";
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
import { formatarDataHoraBR } from "@/lib/formato";

export const metadata = { title: "Auditoria" };

const ENTIDADES = [
  "cliente",
  "contrato",
  "fatura",
  "pagamento",
  "licenca",
  "grupo",
  "usuario",
  "plataforma",
  "anexo",
] as const;

export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: Promise<{ entidade?: string; pagina?: string }>;
}) {
  await exigirPermissao("plataforma.auditoria");
  const { entidade, pagina } = await searchParams;

  const paginaAtual = Math.max(1, Number(pagina) || 1);
  const porPagina = 50;

  const filtro = ENTIDADES.includes(entidade as (typeof ENTIDADES)[number])
    ? (entidade as (typeof ENTIDADES)[number])
    : undefined;

  const linhas = await (filtro
    ? db
        .select()
        .from(auditoria)
        .where(eq(auditoria.entidade, filtro))
        .orderBy(desc(auditoria.criadoEm))
        .limit(porPagina + 1)
        .offset((paginaAtual - 1) * porPagina)
    : db
        .select()
        .from(auditoria)
        .orderBy(desc(auditoria.criadoEm))
        .limit(porPagina + 1)
        .offset((paginaAtual - 1) * porPagina));

  const temProxima = linhas.length > porPagina;
  const visiveis = linhas.slice(0, porPagina);

  const linkCom = (p: number) => {
    const params = new URLSearchParams();
    if (filtro) params.set("entidade", filtro);
    if (p > 1) params.set("pagina", String(p));
    const qs = params.toString();
    return `/painel/auditoria${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader titulo="Auditoria" descricao="Tudo que muda estado passa por aqui." />

      <form className="mb-4 flex items-center gap-2" action="/painel/auditoria">
        <select
          name="entidade"
          defaultValue={filtro ?? ""}
          className="h-9 rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white [&>option]:bg-[#0a0e14]"
        >
          <option value="">Todas as entidades</option>
          {ENTIDADES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10">
          Filtrar
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quando</TableHead>
            <TableHead>Quem</TableHead>
            <TableHead>Ação</TableHead>
            <TableHead>Entidade</TableHead>
            <TableHead>Detalhes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visiveis.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-white/45">
                Nada registrado.
              </TableCell>
            </TableRow>
          ) : (
            visiveis.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap text-white/60">
                  {formatarDataHoraBR(l.criadoEm)}
                </TableCell>
                <TableCell className="text-white/80">{l.atorNome}</TableCell>
                <TableCell className="font-medium text-white">{l.acao}</TableCell>
                <TableCell className="text-white/60">{l.entidade}</TableCell>
                <TableCell className="max-w-md truncate text-xs text-white/45">
                  {l.detalhes ? JSON.stringify(l.detalhes) : "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="mt-4 flex items-center gap-3 text-sm">
        {paginaAtual > 1 ? (
          <a href={linkCom(paginaAtual - 1)} className="text-cyan-200 hover:underline">
            ← Anterior
          </a>
        ) : null}
        <span className="text-white/40">página {paginaAtual}</span>
        {temProxima ? (
          <a href={linkCom(paginaAtual + 1)} className="text-cyan-200 hover:underline">
            Próxima →
          </a>
        ) : null}
      </div>
    </>
  );
}
