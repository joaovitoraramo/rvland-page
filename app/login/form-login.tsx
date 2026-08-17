"use client";

import * as React from "react";
import { useActionState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { entrar, type EstadoLogin } from "./actions";

export function FormLogin() {
  const [estado, acao, pendente] = useActionState<EstadoLogin, FormData>(entrar, {});

  return (
    <form action={acao} className="space-y-5">
      <div>
        <label htmlFor="email" className="rv-eyebrow mb-2 block">
          email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@rvland.dev"
          autoFocus
          required
        />
      </div>

      <div>
        <label htmlFor="senha" className="rv-eyebrow mb-2 block">
          senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••"
          required
        />
      </div>

      {estado.erro ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200"
        >
          <KeyRound className="size-3.5 shrink-0" />
          {estado.erro}
        </p>
      ) : null}

      <Btn type="submit" variante="primario" disabled={pendente} className="w-full">
        {pendente ? "Entrando..." : "Entrar"}
        {!pendente ? <ArrowRight className="size-4" /> : null}
      </Btn>
    </form>
  );
}
