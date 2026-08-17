"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { EstadoAnexo } from "@/app/painel/clientes/[id]/anexos-actions";

export function FormAnexo({
  acao,
}: {
  acao: (estado: EstadoAnexo, formData: FormData) => Promise<EstadoAnexo>;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoAnexo, FormData>(acao, {});

  return (
    <form action={dispatch} className="flex flex-wrap items-center gap-2">
      <input
        type="file"
        name="arquivo"
        required
        className="text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-white/15"
      />
      <Button
        type="submit"
        disabled={pendente}
        variant="secondary"
        className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
      >
        {pendente ? "Enviando..." : "Enviar anexo"}
      </Button>
      {estado.erro ? (
        <p role="alert" className="w-full text-xs text-red-300">
          {estado.erro}
        </p>
      ) : null}
      {estado.ok ? <p className="w-full text-xs text-emerald-300">{estado.ok}</p> : null}
    </form>
  );
}
