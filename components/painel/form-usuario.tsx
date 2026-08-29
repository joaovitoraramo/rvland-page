"use client";

import * as React from "react";
import { useActionState } from "react";
import { UserPlus } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { Label } from "@/components/ui/label";
import { criarUsuario, type EstadoUsuario } from "@/app/(app)/painel/config/actions";

export function FormUsuario({
  gruposDisponiveis,
}: {
  gruposDisponiveis: { id: string; nome: string }[];
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoUsuario, FormData>(criarUsuario, {});

  const campo = (nome: keyof NonNullable<EstadoUsuario["erros"]>) =>
    estado.erros?.[nome] ? (
      <p role="alert" className="mt-1.5 text-xs text-red-300">
        {estado.erros[nome]}
      </p>
    ) : null;

  return (
    <form action={dispatch} className="max-w-lg">
      <div className="space-y-5 rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.045] to-white/[0.02] p-6">
        <div>
          <Label htmlFor="nome">Nome *</Label>
          <input id="nome" name="nome" required aria-invalid={!!estado.erros?.nome} />
          {campo("nome")}
        </div>
        <div>
          <Label htmlFor="email">Email *</Label>
          <input id="email" name="email" type="email" required aria-invalid={!!estado.erros?.email} />
          {campo("email")}
        </div>
        <div>
          <Label htmlFor="senha">Senha provisória *</Label>
          <input
            id="senha"
            name="senha"
            type="text"
            autoComplete="off"
            required
            aria-invalid={!!estado.erros?.senha}
          />
          {campo("senha")}
          <p className="mt-1.5 text-xs text-white/35">
            Mínimo 8 caracteres. Combine a troca no primeiro acesso.
          </p>
        </div>
        <div>
          <Label htmlFor="grupoId">Grupo *</Label>
          <select id="grupoId" name="grupoId" required aria-invalid={!!estado.erros?.grupoId}>
            <option value="">Selecione...</option>
            {gruposDisponiveis.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
          {campo("grupoId")}
        </div>
      </div>

      {estado.erro ? (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {estado.erro}
        </p>
      ) : null}

      <div className="mt-5">
        <Btn type="submit" variante="primario" disabled={pendente}>
          {pendente ? "Criando..." : "Criar usuário"}
          {!pendente ? <UserPlus className="size-4" /> : null}
        </Btn>
      </div>
    </form>
  );
}
