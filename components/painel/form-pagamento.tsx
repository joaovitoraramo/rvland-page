"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstadoPagamento } from "@/app/painel/financeiro/actions";

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

  const estiloInput = "border-white/10 bg-white/5 text-white placeholder:text-white/35";

  return (
    <form action={dispatch} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="valor">Valor (R$) *</Label>
          <Input id="valor" name="valor" defaultValue={valorRestante} required className={estiloInput} />
        </div>
        <div>
          <Label htmlFor="pagoEm">Data do pagamento *</Label>
          <Input id="pagoEm" name="pagoEm" type="date" defaultValue={hoje} required className={estiloInput} />
        </div>
        <div>
          <Label htmlFor="forma">Forma</Label>
          <Input id="forma" name="forma" placeholder="Pix, boleto..." className={estiloInput} />
        </div>
        <div>
          <Label htmlFor="notas">Notas</Label>
          <Input id="notas" name="notas" className={estiloInput} />
        </div>
      </div>

      {estado.erro ? (
        <p role="alert" className="text-sm text-red-300">
          {estado.erro}
        </p>
      ) : null}
      {estado.ok ? <p className="text-sm text-emerald-300">{estado.ok}</p> : null}

      <Button
        type="submit"
        disabled={pendente}
        className="rounded-xl bg-[rgba(0,255,138,0.16)] text-white hover:bg-[rgba(0,255,138,0.22)]"
      >
        {pendente ? "Lançando..." : "Confirmar pagamento"}
      </Button>
    </form>
  );
}
