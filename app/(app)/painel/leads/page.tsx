import Link from "next/link";
import { desc } from "drizzle-orm";
import { ArrowUpRight, Inbox } from "lucide-react";

import { db, leads } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { PageHeader } from "@/components/painel/page-header";
import { BadgeLead } from "@/components/painel/badge-lead";
import { Btn, EmptyState } from "@/components/painel/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { rotuloCanal, STATUS_LEAD } from "@/lib/dominio/leads";
import { formatarDataHoraBR } from "@/lib/formato";

export const metadata = { title: "Leads" };

const ROTULOS_STATUS: Record<string, string> = {
  novo: "Novos",
  em_conversa: "Em conversa",
  proposta: "Proposta",
  ganho: "Ganhos",
  perdido: "Perdidos",
};

export default async function PaginaLeads({
  searchParams,
}: {
  searchParams: Promise<{ origem?: string; status?: string }>;
}) {
  await exigirPermissao("leads.ver");
  const { origem: filtroOrigem, status: filtroStatus } = await searchParams;

  const linhas = await db.select().from(leads).orderBy(desc(leads.criadoEm)).limit(500);
  const filtrados = linhas.filter((l) => {
    if (filtroOrigem && l.origem !== filtroOrigem) return false;
    if (filtroStatus && l.status !== filtroStatus) return false;
    return true;
  });

  const novos = linhas.filter((l) => l.status === "novo").length;

  return (
    <>
      <PageHeader
        trilha="leads"
        titulo="Leads"
        descricao={`${linhas.length} lead(s) no total — ${novos} novo(s) aguardando resposta.`}
      />

      <form className="rv-entrar-1 mb-5 flex flex-wrap items-center gap-2" action="/painel/leads">
        <select name="origem" defaultValue={filtroOrigem ?? ""} className="!w-full sm:!w-48">
          <option value="">Todas as origens</option>
          <option value="br">Brasil (site PT)</option>
          <option value="en">Exterior (/en)</option>
        </select>
        <select name="status" defaultValue={filtroStatus ?? ""} className="!w-full sm:!w-44">
          <option value="">Todos os status</option>
          {STATUS_LEAD.map((s) => (
            <option key={s} value={s}>
              {ROTULOS_STATUS[s]}
            </option>
          ))}
        </select>
        <Btn type="submit" className="max-sm:w-full">Filtrar</Btn>
      </form>

      <div className="rv-entrar-2">
        {filtrados.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
            <EmptyState
              icone={<Inbox />}
              titulo="Nenhum lead no filtro"
              dica="Leads dos formulários do site (PT e /en) aparecem aqui na hora."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recebido</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Negócio</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((l) => (
                <TableRow key={l.id}>
                  <TableCell rotulo="recebido" className="rv-num text-white/55">
                    {formatarDataHoraBR(l.criadoEm)}
                  </TableCell>
                  <TableCell rotulo="nome" className="font-medium text-white">
                    {l.nome}
                  </TableCell>
                  <TableCell rotulo="negócio" className="text-white/55">
                    {l.negocio ?? "—"}
                  </TableCell>
                  <TableCell rotulo="origem">
                    <span className="rv-num rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] uppercase text-white/70">
                      {l.origem}
                    </span>
                  </TableCell>
                  <TableCell rotulo="canal" className="text-white/70">
                    {rotuloCanal[l.canal]}
                  </TableCell>
                  <TableCell rotulo="contato" className="rv-num text-white/70">
                    {l.contato}
                  </TableCell>
                  <TableCell rotulo="status">
                    <BadgeLead status={l.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Btn asChild tamanho="sm" className="max-md:w-full">
                      <Link href={`/painel/leads/${l.id}`}>
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
      </div>
    </>
  );
}
