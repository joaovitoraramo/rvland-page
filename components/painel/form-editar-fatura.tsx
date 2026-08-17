"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstadoEditarFatura } from "@/app/painel/financeiro/actions";

export function FormEditarFatura({
  acaoEditar,
  acaoCancelar,
  vencimento,
  valor,
}: {
  acaoEditar: (estado: EstadoEditarFatura, formData: FormData) => Promise<EstadoEditarFatura>;
  acaoCancelar: (estado: EstadoEditarFatura, formData: FormData) => Promise<EstadoEditarFatura>;
  vencimento: string;
  valor: string;
}) {
  const [estadoEditar, dispatchEditar, pendenteEditar] = useActionState<
    EstadoEditarFatura,
    FormData
  >(acaoEditar, {});
  const [estadoCancelar, dispatchCancelar, pendenteCancelar] = useActionState<
    EstadoEditarFatura,
    FormData
  >(acaoCancelar, {});

  const estiloInput = "border-white/10 bg-white/5 text-white placeholder:text-white/35";

  return (
    <div className="space-y-6">
      <form action={dispatchEditar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="vencimento">Vencimento</Label>
            <Input id="vencimento" name="vencimento" type="date" defaultValue={vencimento} className={estiloInput} />
          </div>
          <div>
            <Label htmlFor="valor-editar">Valor (R$)</Label>
            <Input id="valor-editar" name="valor" defaultValue={valor} className={estiloInput} />
          </div>
        </div>
        {estadoEditar.erro ? <p role="alert" className="text-sm text-red-300">{estadoEditar.erro}</p> : null}
        {estadoEditar.ok ? <p className="text-sm text-emerald-300">{estadoEditar.ok}</p> : null}
        <Button
          type="submit"
          disabled={pendenteEditar}
          variant="secondary"
          className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
        >
          {pendenteEditar ? "Salvando..." : "Salvar alterações"}
        </Button>
      </form>

      <form action={dispatchCancelar} className="space-y-3 border-t border-white/10 pt-4">
        <div>
          <Label htmlFor="motivo">Motivo do cancelamento</Label>
          <Input id="motivo" name="motivo" placeholder="Ex: gerada em duplicidade" className={estiloInput} />
        </div>
        {estadoCancelar.erro ? <p role="alert" className="text-sm text-red-300">{estadoCancelar.erro}</p> : null}
        <Button
          type="submit"
          disabled={pendenteCancelar}
          className="rounded-xl bg-red-500/15 text-red-200 hover:bg-red-500/25"
        >
          {pendenteCancelar ? "Cancelando..." : "Cancelar fatura"}
        </Button>
      </form>
    </div>
  );
}
