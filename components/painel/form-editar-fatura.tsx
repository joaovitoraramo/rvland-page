"use client";

import * as React from "react";
import { useActionState } from "react";

import { Btn } from "@/components/painel/ui";
import { Label } from "@/components/ui/label";
import { InputDinheiro } from "@/components/painel/inputs-mascarados";
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

  return (
    <div className="space-y-6">
      <form action={dispatchEditar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="vencimento">Vencimento</Label>
            <input id="vencimento" name="vencimento" type="date" defaultValue={vencimento} />
          </div>
          <div>
            <Label htmlFor="valor-editar">Valor</Label>
            <InputDinheiro id="valor-editar" name="valor" defaultValue={valor} />
          </div>
        </div>
        {estadoEditar.erro ? (
          <p role="alert" className="text-sm text-red-300">{estadoEditar.erro}</p>
        ) : null}
        {estadoEditar.ok ? <p className="text-sm text-emerald-300">{estadoEditar.ok}</p> : null}
        <Btn type="submit" disabled={pendenteEditar}>
          {pendenteEditar ? "Salvando..." : "Salvar alterações"}
        </Btn>
      </form>

      <form action={dispatchCancelar} className="space-y-4 border-t border-white/8 pt-5">
        <div>
          <Label htmlFor="motivo">Motivo do cancelamento</Label>
          <input id="motivo" name="motivo" placeholder="Ex: gerada em duplicidade" />
        </div>
        {estadoCancelar.erro ? (
          <p role="alert" className="text-sm text-red-300">{estadoCancelar.erro}</p>
        ) : null}
        <Btn type="submit" variante="perigo" disabled={pendenteCancelar}>
          {pendenteCancelar ? "Cancelando..." : "Cancelar fatura"}
        </Btn>
      </form>
    </div>
  );
}
