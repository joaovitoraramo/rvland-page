import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";

import { db, grupos, perfis } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { alternarUsuarioAtivo, trocarGrupoUsuario } from "@/app/painel/config/actions";
import { PageHeader } from "@/components/painel/page-header";
import { TrocaGrupo } from "@/components/painel/troca-grupo";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Usuários" };

export default async function PaginaUsuarios() {
  const perfil = await exigirPermissao("plataforma.usuarios");

  const [lista, listaGrupos] = await Promise.all([
    db
      .select({
        id: perfis.id,
        nome: perfis.nome,
        email: perfis.email,
        ativo: perfis.ativo,
        grupoId: perfis.grupoId,
        grupoNome: grupos.nome,
      })
      .from(perfis)
      .innerJoin(grupos, eq(grupos.id, perfis.grupoId))
      .orderBy(asc(perfis.nome)),
    db.select().from(grupos).orderBy(asc(grupos.nome)),
  ]);

  const gruposDisponiveis = listaGrupos.map((g) => ({ id: g.id, nome: g.nome }));

  return (
    <>
      <PageHeader
        titulo="Usuários"
        acoes={
          <Button asChild className="rounded-xl bg-[rgba(0,229,255,0.18)] text-white hover:bg-[rgba(0,229,255,0.26)]">
            <Link href="/painel/config/usuarios/novo">
              <Plus className="h-4 w-4" /> Novo usuário
            </Link>
          </Button>
        }
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Grupo</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lista.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium text-white">
                {u.nome}
                {u.id === perfil.id ? <span className="ml-2 text-xs text-white/35">(você)</span> : null}
              </TableCell>
              <TableCell className="text-white/60">{u.email}</TableCell>
              <TableCell>
                {u.id === perfil.id ? (
                  <span className="text-white/70">{u.grupoNome}</span>
                ) : (
                  <TrocaGrupo
                    acao={trocarGrupoUsuario.bind(null, u.id)}
                    grupoAtual={u.grupoId}
                    gruposDisponiveis={gruposDisponiveis}
                  />
                )}
              </TableCell>
              <TableCell>
                <span className={u.ativo ? "text-emerald-300" : "text-white/40"}>
                  {u.ativo ? "Ativo" : "Desativado"}
                </span>
              </TableCell>
              <TableCell className="text-right">
                {u.id !== perfil.id ? (
                  <form action={alternarUsuarioAtivo.bind(null, u.id)}>
                    <button
                      type="submit"
                      className={
                        u.ativo
                          ? "text-sm text-white/40 hover:text-red-300"
                          : "text-sm text-emerald-300 hover:underline"
                      }
                    >
                      {u.ativo ? "Desativar" : "Reativar"}
                    </button>
                  </form>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
