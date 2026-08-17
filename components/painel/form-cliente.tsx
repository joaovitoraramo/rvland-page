"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EstadoFormCliente } from "@/app/painel/clientes/actions";

type DadosCliente = {
  nome?: string;
  razaoSocial?: string | null;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  notas?: string | null;
};

export function FormCliente({
  acao,
  inicial,
  rotuloEnviar,
}: {
  acao: (estado: EstadoFormCliente, formData: FormData) => Promise<EstadoFormCliente>;
  inicial?: DadosCliente;
  rotuloEnviar: string;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoFormCliente, FormData>(acao, {});

  const campo = (nome: keyof NonNullable<EstadoFormCliente["erros"]>) =>
    estado.erros?.[nome] ? (
      <p role="alert" className="mt-1 text-xs text-red-300">
        {estado.erros[nome]}
      </p>
    ) : null;

  const estiloInput = "border-white/10 bg-white/5 text-white placeholder:text-white/35";

  return (
    <form action={dispatch} className="max-w-2xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="nome">Nome *</Label>
          <Input id="nome" name="nome" defaultValue={inicial?.nome ?? ""} required className={estiloInput} />
          {campo("nome")}
        </div>
        <div>
          <Label htmlFor="razaoSocial">Razão social</Label>
          <Input id="razaoSocial" name="razaoSocial" defaultValue={inicial?.razaoSocial ?? ""} className={estiloInput} />
        </div>
        <div>
          <Label htmlFor="documento">CNPJ / CPF</Label>
          <Input id="documento" name="documento" defaultValue={inicial?.documento ?? ""} className={estiloInput} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={inicial?.email ?? ""} className={estiloInput} />
          {campo("email")}
        </div>
        <div>
          <Label htmlFor="telefone">Telefone / WhatsApp</Label>
          <Input id="telefone" name="telefone" defaultValue={inicial?.telefone ?? ""} className={estiloInput} />
        </div>
      </div>

      <div>
        <Label htmlFor="notas">Notas internas</Label>
        <Textarea id="notas" name="notas" defaultValue={inicial?.notas ?? ""} className={`min-h-[90px] ${estiloInput}`} />
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
        {pendente ? "Salvando..." : rotuloEnviar}
      </Button>
    </form>
  );
}
