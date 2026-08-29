"use client";

import { useActionState } from "react";

import { Btn } from "@/components/painel/ui";
import { InputDolar } from "@/components/painel/inputs-mascarados";
import type { PricingEn } from "@/lib/dominio/preco-site";
import type { EstadoPrecos } from "@/app/(app)/painel/config/precos-site/actions";

export function FormPrecosSite({
  acao,
  atual,
}: {
  acao: (estado: EstadoPrecos, formData: FormData) => Promise<EstadoPrecos>;
  atual: PricingEn;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoPrecos, FormData>(acao, {});

  const planos = [
    {
      campo: "full",
      titulo: "Pay in full",
      detalhe: "pagamento único",
      valor: atual.planos.full.valorCentavos,
      ativo: atual.planos.full.ativo,
    },
    {
      campo: "m6",
      titulo: "6 months",
      detalhe: "6 parcelas mensais",
      valor: atual.planos.m6.valorCentavos,
      ativo: atual.planos.m6.ativo,
    },
    {
      campo: "m12",
      titulo: "12 months",
      detalhe: "12 parcelas mensais",
      valor: atual.planos.m12.valorCentavos,
      ativo: atual.planos.m12.ativo,
    },
  ] as const;

  return (
    <form action={dispatch} className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {planos.map((p) => (
          <div
            key={p.campo}
            className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-white">{p.titulo}</div>
                <div className="text-xs text-white/40">{p.detalhe}</div>
              </div>
              <label className="flex items-center gap-2 text-xs text-white/60">
                <input type="checkbox" name={`${p.campo}_ativo`} defaultChecked={p.ativo} />
                ativo
              </label>
            </div>
            <InputDolar name={`${p.campo}_valor`} defaultValue={String(p.valor)} required />
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 md:grid-cols-2">
        <div>
          <label className="rv-eyebrow mb-2 block" htmlFor="care_valor">
            support &amp; hosting mensal (após o período incluso)
          </label>
          <InputDolar
            id="care_valor"
            name="care_valor"
            defaultValue={String(atual.care.valorCentavos)}
            required
          />
        </div>
        <div>
          <label className="rv-eyebrow mb-2 block" htmlFor="care_meses">
            meses inclusos em todos os planos
          </label>
          <input
            id="care_meses"
            name="care_meses"
            type="number"
            min={1}
            max={36}
            defaultValue={atual.care.mesesInclusos}
            required
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Btn type="submit" variante="primario" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar e atualizar /en"}
        </Btn>
        {estado.erro ? (
          <p role="alert" className="text-xs text-red-300">
            {estado.erro}
          </p>
        ) : null}
        {estado.ok ? <p className="text-xs text-emerald-300">{estado.ok}</p> : null}
      </div>
    </form>
  );
}
