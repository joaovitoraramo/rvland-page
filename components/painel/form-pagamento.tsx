"use client";

import * as React from "react";
import { useActionState } from "react";
import { CircleCheck } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { Label } from "@/components/ui/label";
import { InputDinheiro } from "@/components/painel/inputs-mascarados";
import type { EstadoPagamento } from "@/app/(app)/painel/financeiro/actions";

export function FormPagamento({
  acao,
  valorRestante,
  hoje,
}: {
  acao: (estado: EstadoPagamento, formData: FormData) => Promise<EstadoPagamento>;
  /** Pré-preenchido no campo valor: "1.500,00". */
  valorRestante: string;
  hoje: string;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoPagamento, FormData>(acao, {});

  return (
    <form action={dispatch} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="valor">Valor *</Label>
          <InputDinheiro id="valor" name="valor" defaultValue={valorRestante} required />
        </div>
        <div>
          <Label htmlFor="pagoEm">Data do pagamento *</Label>
          <input id="pagoEm" name="pagoEm" type="date" defaultValue={hoje} required />
        </div>
        <div>
          <Label htmlFor="forma">Forma</Label>
          <input id="forma" name="forma" placeholder="Pix, boleto..." />
        </div>
        <div>
          <Label htmlFor="notas">Notas</Label>
          <input id="notas" name="notas" />
        </div>
      </div>

      {estado.erro ? (
        <p role="alert" className="text-sm text-red-300">
          {estado.erro}
        </p>
      ) : null}
      {estado.ok ? <p className="text-sm text-emerald-300">{estado.ok}</p> : null}

      <Btn type="submit" variante="primario" disabled={pendente}>
        {pendente ? "Lançando..." : "Confirmar pagamento"}
        {!pendente ? <CircleCheck className="size-4" /> : null}
      </Btn>
    </form>
  );
}
