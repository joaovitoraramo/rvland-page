"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { entrar, type EstadoLogin } from "./actions";

export function FormLogin() {
  const [estado, acao, pendente] = useActionState<EstadoLogin, FormData>(entrar, {});

  return (
    <form action={acao} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm text-white/70">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="border-white/10 bg-white/5 text-white placeholder:text-white/35"
        />
      </div>

      <div>
        <label htmlFor="senha" className="mb-1.5 block text-sm text-white/70">
          Senha
        </label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="border-white/10 bg-white/5 text-white placeholder:text-white/35"
        />
      </div>

      {estado.erro ? (
        <p role="alert" className="text-sm text-red-300">
          {estado.erro}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pendente}
        className="w-full rounded-xl bg-[rgba(0,229,255,0.18)] text-white hover:bg-[rgba(0,229,255,0.26)]"
      >
        {pendente ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
