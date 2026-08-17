import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db, perfis, grupos, gruposPermissoes } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase/server";
import { temPermissao, type Permissao } from "@/lib/dominio/permissoes";

export type PerfilSessao = {
  id: string;
  nome: string;
  email: string;
  grupoId: string;
  grupoNome: string;
  todasPermissoes: boolean;
  permissoes: Set<string>;
};

/** Perfil da sessão atual (cacheado por request). Null: sem sessão ou inativo. */
export const getPerfil = cache(async (): Promise<PerfilSessao | null> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [linha] = await db
    .select({
      id: perfis.id,
      nome: perfis.nome,
      email: perfis.email,
      ativo: perfis.ativo,
      grupoId: perfis.grupoId,
      grupoNome: grupos.nome,
      todasPermissoes: grupos.todasPermissoes,
    })
    .from(perfis)
    .innerJoin(grupos, eq(grupos.id, perfis.grupoId))
    .where(eq(perfis.id, user.id))
    .limit(1);

  if (!linha || !linha.ativo) return null;

  const permissoes = linha.todasPermissoes
    ? new Set<string>()
    : new Set(
        (
          await db
            .select({ permissao: gruposPermissoes.permissao })
            .from(gruposPermissoes)
            .where(eq(gruposPermissoes.grupoId, linha.grupoId))
        ).map((p) => p.permissao)
      );

  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    grupoId: linha.grupoId,
    grupoNome: linha.grupoNome,
    todasPermissoes: linha.todasPermissoes,
    permissoes,
  };
});

export async function exigirPerfil(): Promise<PerfilSessao> {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");
  return perfil;
}

export async function exigirPermissao(permissao: Permissao): Promise<PerfilSessao> {
  const perfil = await exigirPerfil();
  if (!temPermissao(perfil, permissao)) redirect("/painel?negado=1");
  return perfil;
}

export function pode(perfil: PerfilSessao, permissao: Permissao): boolean {
  return temPermissao(perfil, permissao);
}
