import { desc, eq } from "drizzle-orm";
import { ScrollText } from "lucide-react";

import { db, auditoria } from "@/lib/db";
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
      <PageHeader
        trilha="auditoria"
        titulo="Auditoria"
        descricao="Tudo que muda estado passa por aqui."
      />

      <form className="rv-entrar-1 mb-5 flex items-center gap-2" action="/painel/auditoria">
        <select name="entidade" defaultValue={filtro ?? ""} className="!w-52">
          <option value="">Todas as entidades</option>
          {ENTIDADES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <Btn type="submit">Filtrar</Btn>
      </form>

      <div className="rv-entrar-2">
        {visiveis.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
            <EmptyState icone={<ScrollText />} titulo="Nada registrado" />
          </div>
        ) : (
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
              {visiveis.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="rv-num whitespace-nowrap text-white/55">
                    {formatarDataHoraBR(l.criadoEm)}
                  </TableCell>
                  <TableCell className="text-white/75">{l.atorNome}</TableCell>
                  <TableCell className="rv-num text-[13px] font-medium text-white">
                    {l.acao}
                  </TableCell>
                  <TableCell>
                    <span className="rv-eyebrow rounded-full border border-white/10 px-2 py-0.5">
                      {l.entidade}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-md truncate font-mono text-[11px] text-white/35">
                    {l.detalhes ? JSON.stringify(l.detalhes) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="mt-5 flex items-center gap-3 text-sm">
          {paginaAtual > 1 ? (
            <Btn asChild tamanho="sm">
              <a href={linkCom(paginaAtual - 1)}>← Anterior</a>
            </Btn>
          ) : null}
          <span className="rv-eyebrow">página {paginaAtual}</span>
          {temProxima ? (
            <Btn asChild tamanho="sm">
              <a href={linkCom(paginaAtual + 1)}>Próxima →</a>
            </Btn>
          ) : null}
        </div>
      </div>
    </>
  );
}
