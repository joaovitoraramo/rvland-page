import Link from "next/link";
import { asc } from "drizzle-orm";
import { Pencil, Plus } from "lucide-react";

import { db, grupos, perfis } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { excluirGrupo } from "@/app/painel/config/actions";
import { PageHeader } from "@/components/painel/page-header";
import { Btn } from "@/components/painel/ui";
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
        trilha="config / grupos"
        titulo="Grupos e permissões"
        descricao="Permissão vive no grupo; usuário pertence a exatamente um grupo."
        acoes={
          <Btn asChild variante="primario">
            <Link href="/painel/config/grupos/novo">
              <Plus className="size-4" /> Novo grupo
            </Link>
          </Btn>
        }
      />

      <div className="rv-entrar-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grupo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-center">Usuários</TableHead>
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
                      <span className="rv-eyebrow ml-2 rounded-full border border-[rgba(0,255,138,0.25)] bg-[rgba(0,255,138,0.06)] px-2 py-0.5 !text-[#7DFFC4]">
                        acesso total
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-white/55">{g.descricao ?? "—"}</TableCell>
                  <TableCell className="rv-num text-center text-white/70">{qtd}</TableCell>
                  <TableCell className="text-right">
                    {!g.todasPermissoes ? (
                      <div className="inline-flex items-center gap-1.5">
                        <Btn asChild tamanho="sm">
                          <Link href={`/painel/config/grupos/${g.id}`}>
                            <Pencil className="size-3.5" />
                            Editar
                          </Link>
                        </Btn>
                        {qtd === 0 ? (
                          <form action={excluirGrupo.bind(null, g.id)}>
                            <Btn type="submit" tamanho="sm" variante="perigo">
                              Excluir
                            </Btn>
                          </form>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-white/30">não editável</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
