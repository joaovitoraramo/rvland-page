"use client";

import * as React from "react";
import { useActionState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { entrar, type EstadoLogin } from "./actions";

// Só o email é lembrado (localStorage) — a sessão continua nas mãos do
// Supabase; desmarcar e entrar apaga o registro.
const CHAVE_EMAIL = "rvland.login.email";

export function FormLogin() {
  const [estado, acao, pendente] = useActionState<EstadoLogin, FormData>(entrar, {});

  const [email, setEmail] = React.useState("");
  const [lembrar, setLembrar] = React.useState(false);
  const emailRef = React.useRef<HTMLInputElement | null>(null);
  const senhaRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const salvo = window.localStorage.getItem(CHAVE_EMAIL);
    if (salvo) {
      setEmail(salvo);
      setLembrar(true);
      senhaRef.current?.focus();
    } else {
      emailRef.current?.focus();
    }
  }, []);

  const persistirEscolha = () => {
    if (lembrar && email.trim()) {
      window.localStorage.setItem(CHAVE_EMAIL, email.trim());
    } else {
      window.localStorage.removeItem(CHAVE_EMAIL);
    }
  };

  return (
    <form action={acao} onSubmit={persistirEscolha} className="space-y-5">
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
          required
          ref={emailRef}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
          ref={senhaRef}
        />
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-white/60 transition-colors hover:text-white">
        <input
          type="checkbox"
          checked={lembrar}
          onChange={(e) => setLembrar(e.target.checked)}
        />
        Lembrar meu email
      </label>

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
