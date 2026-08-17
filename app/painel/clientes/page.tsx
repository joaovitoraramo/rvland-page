import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowUpRight, Pencil, Plus, Search, Users } from "lucide-react";

import { db, clientes } from "@/lib/db";
import { exigirPermissao, pode } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { statusDeClientes } from "@/lib/consultas/licencas";
import { digitsOnly } from "@/lib/site";
import { mascararDocumento } from "@/lib/dominio/mascaras";
import { PageHeader } from "@/components/painel/page-header";
import { StatusBadge } from "@/components/painel/status-badge";
import { Btn, EmptyState } from "@/components/painel/ui";
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

  // Busca por texto; documentos/telefones também casam por dígitos
  const buscaDigitos = busca ? digitsOnly(busca) : "";
  const filtradosPorTexto = busca
    ? todos.filter((c) => {
        const textual = [c.nome, c.razaoSocial, c.email]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(busca.toLowerCase()));
        const numerico =
          buscaDigitos.length >= 3 &&
          [c.documento, c.telefone]
            .filter(Boolean)
            .some((v) => digitsOnly(v!).includes(buscaDigitos));
        return textual || numerico;
      })
    : todos;

  const mapaStatus = await statusDeClientes(filtradosPorTexto.map((c) => c.id));

  const lista = filtroStatus
    ? filtradosPorTexto.filter((c) => mapaStatus.get(c.id)?.status === filtroStatus)
    : filtradosPorTexto;

  return (
    <>
      <PageHeader
        trilha="clientes"
        titulo="Clientes"
        descricao={`${lista.length} cliente(s)${arquivados === "1" ? " arquivados" : ""}`}
        acoes={
          pode(perfil, "clientes.criar") ? (
            <Btn asChild variante="primario">
              <Link href="/painel/clientes/novo">
                <Plus className="size-4" /> Novo cliente
              </Link>
            </Btn>
          ) : null
        }
      />

      <form
        className="rv-entrar-1 mb-5 flex flex-wrap items-center gap-2"
        action="/painel/clientes"
      >
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/30" />
          <input
            type="search"
            name="busca"
            defaultValue={busca ?? ""}
            placeholder="Nome, documento, email ou telefone"
            className="!pl-9"
          />
        </div>
        <select name="status" defaultValue={filtroStatus ?? ""} className="!w-full sm:!w-44">
          <option value="">Todos os status</option>
          <option value="em_dia">Em dia</option>
          <option value="atrasado">Atrasado</option>
          <option value="bloqueado">Bloqueado</option>
          <option value="cancelado">Cancelado</option>
          <option value="sem_licenca">Sem licença</option>
        </select>
        <Btn type="submit">Filtrar</Btn>
        <Link
          href={arquivados === "1" ? "/painel/clientes" : "/painel/clientes?arquivados=1"}
          className="ml-auto text-xs text-white/40 transition-colors hover:text-white"
        >
          {arquivados === "1" ? "← Voltar aos ativos" : "Ver arquivados"}
        </Link>
      </form>

      <div className="rv-entrar-2">
        {lista.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
            <EmptyState
              icone={<Users />}
              titulo="Nenhum cliente encontrado"
              dica={busca ? "Tente outra busca ou limpe os filtros." : "Cadastre o primeiro cliente."}
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Licença</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((c) => {
                const st = mapaStatus.get(c.id);
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                      href={`/painel/clientes/${c.id}`}
                        className="font-medium text-white hover:text-[#8AF0FF]"
                      >
                        {c.nome}
                      </Link>
                      {c.razaoSocial ? (
                        <div className="mt-0.5 text-xs text-white/40">{c.razaoSocial}</div>
                      ) : null}
                    </TableCell>
                    <TableCell rotulo="documento" className="rv-num text-white/60">
                      {c.documento ? mascararDocumento(c.documento) : "—"}
                    </TableCell>
                    <TableCell rotulo="contato" className="text-white/60">{c.email ?? c.telefone ?? "—"}</TableCell>
                    <TableCell rotulo="licença">
                      {st ? (
                        <StatusBadge status={st.status} simulacao={config.modoSimulacao} />
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1.5 max-md:flex max-md:w-full max-md:[&>a:first-child]:flex-1">
                        <Btn asChild tamanho="sm">
                          <Link href={`/painel/clientes/${c.id}`}>
                            Abrir
                            <ArrowUpRight className="size-3.5" />
                          </Link>
                        </Btn>
                        {pode(perfil, "clientes.editar") ? (
                          <Btn asChild tamanho="icone" variante="fantasma" title="Editar">
                            <Link
                              href={`/painel/clientes/${c.id}/editar`}
                              aria-label={`Editar ${c.nome}`}
                            >
                              <Pencil className="size-4" />
                            </Link>
                          </Btn>
                        ) : null}
                      </div>
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
