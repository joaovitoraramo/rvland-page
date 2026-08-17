import Link from "next/link";
import { asc } from "drizzle-orm";
import { Plus } from "lucide-react";

import { db, grupos, perfis } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { excluirGrupo } from "@/app/painel/config/actions";
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

export const metadata = { title: "Grupos" };

export default async function PaginaGrupos() {
  await exigirPermissao("plataforma.grupos");

  const lista = await db.select().from(grupos).orderBy(asc(grupos.nome));
  const usuarios = await db.select({ grupoId: perfis.grupoId }).from(perfis);
  const qtdPorGrupo = usuarios.reduce((acc, u) => {
    acc.set(u.grupoId, (acc.get(u.grupoId) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());

  return (
    <>
      <PageHeader
        titulo="Grupos e permissões"
        descricao="Permissão vive no grupo; usuário pertence a exatamente um grupo."
        acoes={
          <Button asChild className="rounded-xl bg-[rgba(0,229,255,0.18)] text-white hover:bg-[rgba(0,229,255,0.26)]">
            <Link href="/painel/config/grupos/novo">
              <Plus className="h-4 w-4" /> Novo grupo
            </Link>
          </Button>
        }
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Grupo</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Usuários</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lista.map((g) => {
            const qtd = qtdPorGrupo.get(g.id) ?? 0;
            return (
              <TableRow key={g.id}>
                <TableCell className="font-medium text-white">
                  {g.nome}
                  {g.todasPermissoes ? (
                    <span className="ml-2 rounded-full border border-[rgba(0,255,138,0.25)] bg-[rgba(0,255,138,0.08)] px-2 py-0.5 text-xs text-[rgba(150,255,200,0.9)]">
                      acesso total
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-white/60">{g.descricao ?? "—"}</TableCell>
                <TableCell className="text-white/70">{qtd}</TableCell>
                <TableCell className="text-right">
                  {!g.todasPermissoes ? (
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/painel/config/grupos/${g.id}`}
                        className="text-sm text-cyan-200 hover:underline"
                      >
                        Editar
                      </Link>
                      {qtd === 0 ? (
                        <form action={excluirGrupo.bind(null, g.id)}>
                          <button type="submit" className="text-sm text-white/40 hover:text-red-300">
                            Excluir
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-white/35">não editável</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
