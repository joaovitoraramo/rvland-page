"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { criarUsuario, type EstadoUsuario } from "@/app/painel/config/actions";

export function FormUsuario({
  gruposDisponiveis,
}: {
  gruposDisponiveis: { id: string; nome: string }[];
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoUsuario, FormData>(criarUsuario, {});

  const campo = (nome: keyof NonNullable<EstadoUsuario["erros"]>) =>
    estado.erros?.[nome] ? (
      <p role="alert" className="mt-1 text-xs text-red-300">
        {estado.erros[nome]}
      </p>
    ) : null;

  const estiloInput = "border-white/10 bg-white/5 text-white placeholder:text-white/35";

  return (
    <form action={dispatch} className="max-w-lg space-y-4">
      <div>
        <Label htmlFor="nome">Nome *</Label>
        <Input id="nome" name="nome" required className={estiloInput} />
        {campo("nome")}
      </div>
      <div>
        <Label htmlFor="email">Email *</Label>
        <Input id="email" name="email" type="email" required className={estiloInput} />
        {campo("email")}
      </div>
      <div>
        <Label htmlFor="senha">Senha provisória *</Label>
        <Input id="senha" name="senha" type="text" autoComplete="off" required className={estiloInput} />
        {campo("senha")}
        <p className="mt-1 text-xs text-white/40">Mínimo 8 caracteres. Combine a troca no primeiro acesso.</p>
      </div>
      <div>
        <Label htmlFor="grupoId">Grupo *</Label>
        <Select id="grupoId" name="grupoId" required>
          <option value="">Selecione...</option>
          {gruposDisponiveis.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nome}
            </option>
          ))}
        </Select>
        {campo("grupoId")}
      </div>

      {estado.erro ? (
        <p role="alert" className="text-sm text-red-300">
          {estado.erro}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pendente}
        className="rounded-xl bg-[rgba(0,229,255,0.18)] text-white hover:bg-[rgba(0,229,255,0.26)]"
      >
        {pendente ? "Criando..." : "Criar usuário"}
      </Button>
    </form>
  );
}
