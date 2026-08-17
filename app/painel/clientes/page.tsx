import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";

import { db, clientes } from "@/lib/db";
import { exigirPermissao, pode } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { statusDeClientes } from "@/lib/consultas/licencas";
import { PageHeader } from "@/components/painel/page-header";
import { StatusBadge } from "@/components/painel/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Clientes" };

export default async function PaginaClientes({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; status?: string; arquivados?: string }>;
}) {
  const perfil = await exigirPermissao("clientes.ver");
  const { busca, status: filtroStatus, arquivados } = await searchParams;
  const config = await getConfig();

  const statusCliente = arquivados === "1" ? "arquivado" : "ativo";
  const todos = await db
    .select()
    .from(clientes)
    .where(eq(clientes.status, statusCliente))
    .orderBy(asc(clientes.nome));

  const filtradosPorTexto = busca
    ? todos.filter((c) =>
        [c.nome, c.razaoSocial, c.documento, c.email]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(busca.toLowerCase()))
      )
    : todos;

  const mapaStatus = await statusDeClientes(filtradosPorTexto.map((c) => c.id));

  const lista = filtroStatus
    ? filtradosPorTexto.filter((c) => mapaStatus.get(c.id)?.status === filtroStatus)
    : filtradosPorTexto;

  return (
    <>
      <PageHeader
        titulo="Clientes"
        descricao={`${lista.length} cliente(s)`}
        acoes={
          pode(perfil, "clientes.criar") ? (
            <Button asChild className="rounded-xl bg-[rgba(0,229,255,0.18)] text-white hover:bg-[rgba(0,229,255,0.26)]">
              <Link href="/painel/clientes/novo">
                <Plus className="h-4 w-4" /> Novo cliente
              </Link>
            </Button>
          ) : null
        }
      />

      <form className="mb-4 flex flex-wrap items-center gap-2" action="/painel/clientes">
        <input
          type="search"
          name="busca"
          defaultValue={busca ?? ""}
          placeholder="Buscar por nome, documento ou email..."
          className="h-9 w-64 rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/35 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <select
          name="status"
          defaultValue={filtroStatus ?? ""}
          className="h-9 rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white [&>option]:bg-[#0a0e14]"
        >
          <option value="">Todos os status</option>
          <option value="em_dia">Em dia</option>
          <option value="atrasado">Atrasado</option>
          <option value="bloqueado">Bloqueado</option>
          <option value="cancelado">Cancelado</option>
          <option value="sem_licenca">Sem licença</option>
        </select>
        <Button type="submit" variant="secondary" className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10">
          Filtrar
        </Button>
        <Link
          href={arquivados === "1" ? "/painel/clientes" : "/painel/clientes?arquivados=1"}
          className="ml-auto text-xs text-white/50 hover:text-white"
        >
          {arquivados === "1" ? "← Voltar aos ativos" : "Ver arquivados"}
        </Link>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Documento</TableHead>
            <TableHead>Contato</TableHead>
            <TableHead>Licença</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lista.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-white/45">
                Nenhum cliente encontrado.
              </TableCell>
            </TableRow>
          ) : (
            lista.map((c) => {
              const st = mapaStatus.get(c.id);
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/painel/clientes/${c.id}`} className="font-medium text-white hover:underline">
                      {c.nome}
                    </Link>
                    {c.razaoSocial ? (
                      <div className="text-xs text-white/45">{c.razaoSocial}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-white/60">{c.documento ?? "—"}</TableCell>
                  <TableCell className="text-white/60">
                    {c.email ?? c.telefone ?? "—"}
                  </TableCell>
                  <TableCell>
                    {st ? <StatusBadge status={st.status} simulacao={config.modoSimulacao} /> : null}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </>
  );
}
