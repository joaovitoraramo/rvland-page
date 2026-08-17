"use client";

import * as React from "react";
import { useActionState } from "react";

import { Btn } from "@/components/painel/ui";
import { Label } from "@/components/ui/label";
import { InputDinheiro } from "@/components/painel/inputs-mascarados";
import type { EstadoNovaVigencia } from "@/app/painel/contratos/actions";

export function FormVigencia({
  acao,
  competencias,
}: {
  acao: (estado: EstadoNovaVigencia, formData: FormData) => Promise<EstadoNovaVigencia>;
  /** Próximas competências (valor ISO dia 1º + rótulo MM/AAAA). */
  competencias: { valor: string; rotulo: string }[];
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoNovaVigencia, FormData>(acao, {});

  return (
    <form action={dispatch} className="flex flex-wrap items-end gap-3">
      <div>
        <Label htmlFor="valor">Novo valor</Label>
        <InputDinheiro id="valor" name="valor" required className="w-40" />
      </div>

      <div>
        <Label htmlFor="vigenteDesde">A partir de</Label>
        <select id="vigenteDesde" name="vigenteDesde" className="!w-36">
          {competencias.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </div>

      <Btn type="submit" disabled={pendente}>
        {pendente ? "Salvando..." : "Registrar vigência"}
      </Btn>

      {estado.erro ? (
        <p role="alert" className="w-full text-sm text-red-300">
          {estado.erro}
        </p>
      ) : null}
      {estado.ok ? <p className="w-full text-sm text-emerald-300">{estado.ok}</p> : null}
    </form>
  );
}
