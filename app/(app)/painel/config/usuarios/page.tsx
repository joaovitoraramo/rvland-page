import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";

import { db, grupos, perfis } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { alternarUsuarioAtivo, trocarGrupoUsuario } from "@/app/(app)/painel/config/actions";
import { PageHeader } from "@/components/painel/page-header";
import { TrocaGrupo } from "@/components/painel/troca-grupo";
import { Avatar, Btn } from "@/components/painel/ui";
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
        trilha="config / usuários"
        titulo="Usuários"
        acoes={
          <Btn asChild variante="primario">
            <Link href="/painel/config/usuarios/novo">
              <Plus className="size-4" /> Novo usuário
            </Link>
          </Btn>
        }
      />

      <div className="rv-entrar-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.map((u) => (
              <TableRow key={u.id}>
                <TableCell rotulo="usuário">
                  <span className="flex items-center gap-3 max-md:justify-end">
                    <Avatar nome={u.nome} className="size-8 text-[10px]" />
                    <span className="font-medium text-white">
                      {u.nome}
                      {u.id === perfil.id ? (
                        <span className="ml-2 text-xs font-normal text-white/30">(você)</span>
                      ) : null}
                    </span>
                  </span>
                </TableCell>
                <TableCell rotulo="email" className="text-white/55">{u.email}</TableCell>
                <TableCell rotulo="grupo">
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
                <TableCell rotulo="situação">
                  <span
                    className={`rv-eyebrow ${u.ativo ? "!text-[#7DFFC4]" : "!text-white/30"}`}
                  >
                    {u.ativo ? "ativo" : "desativado"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {u.id !== perfil.id ? (
                    <form action={alternarUsuarioAtivo.bind(null, u.id)} className="inline">
                      <Btn
                        type="submit"
                        tamanho="sm"
                        variante={u.ativo ? "perigo" : "secundario"}
                      >
                        {u.ativo ? "Desativar" : "Reativar"}
                      </Btn>
                    </form>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
