"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { Label } from "@/components/ui/label";
import { InputDocumento, InputTelefone } from "@/components/painel/inputs-mascarados";
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
      <p role="alert" className="mt-1.5 text-xs text-red-300">
        {estado.erros[nome]}
      </p>
    ) : null;

  return (
    <form action={dispatch} className="max-w-2xl">
      <div className="rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.045] to-white/[0.02] p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="nome">Nome *</Label>
            <input
              id="nome"
              name="nome"
              defaultValue={inicial?.nome ?? ""}
              placeholder="Nome fantasia"
              required
              aria-invalid={!!estado.erros?.nome}
            />
            {campo("nome")}
          </div>
          <div>
            <Label htmlFor="razaoSocial">Razão social</Label>
            <input id="razaoSocial" name="razaoSocial" defaultValue={inicial?.razaoSocial ?? ""} />
          </div>
          <div>
            <Label htmlFor="documento">CNPJ / CPF</Label>
            <InputDocumento id="documento" name="documento" defaultValue={inicial?.documento ?? ""} />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="contato@cliente.com"
              defaultValue={inicial?.email ?? ""}
              aria-invalid={!!estado.erros?.email}
            />
            {campo("email")}
          </div>
          <div>
            <Label htmlFor="telefone">Telefone / WhatsApp</Label>
            <InputTelefone id="telefone" name="telefone" defaultValue={inicial?.telefone ?? ""} />
          </div>
        </div>

        <div className="mt-5">
          <Label htmlFor="notas">Notas internas</Label>
          <textarea
            id="notas"
            name="notas"
            defaultValue={inicial?.notas ?? ""}
            placeholder="Contexto, combinados, particularidades..."
            className="min-h-[90px]"
          />
        </div>
      </div>

      {estado.erro ? (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {estado.erro}
        </p>
      ) : null}

      <div className="mt-5">
        <Btn type="submit" variante="primario" disabled={pendente}>
          {pendente ? "Salvando..." : rotuloEnviar}
          {!pendente ? <Check className="size-4" /> : null}
        </Btn>
      </div>
    </form>
  );
}
