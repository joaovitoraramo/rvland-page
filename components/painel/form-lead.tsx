"use client";

import * as React from "react";
import { useActionState } from "react";

import { Btn } from "@/components/painel/ui";
import { SelectRico } from "@/components/painel/select-rico";
import { STATUS_LEAD, type StatusLead } from "@/lib/dominio/leads";
import type { EstadoLead } from "@/app/(app)/painel/leads/actions";

const ROTULOS: Record<StatusLead, string> = {
  novo: "Novo",
  em_conversa: "Em conversa",
  proposta: "Proposta",
  ganho: "Ganho",
  perdido: "Perdido",
};

export function FormLead({
  acao,
  statusAtual,
  notasAtuais,
}: {
  acao: (estado: EstadoLead, formData: FormData) => Promise<EstadoLead>;
  statusAtual: StatusLead;
  notasAtuais: string;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoLead, FormData>(acao, {});
  const [status, setStatus] = React.useState<string>(statusAtual);

  return (
    <form action={dispatch} className="space-y-4">
      <div>
        <label className="rv-eyebrow mb-2 block" htmlFor="status">
          status
        </label>
        <SelectRico
          id="status"
          name="status"
          value={status}
          onValueChange={setStatus}
          opcoes={STATUS_LEAD.map((s) => ({ valor: s, titulo: ROTULOS[s] }))}
        />
      </div>
      <div>
        <label className="rv-eyebrow mb-2 block" htmlFor="notas">
          notas
        </label>
        <textarea
          id="notas"
          name="notas"
          rows={5}
          defaultValue={notasAtuais}
          placeholder="Contexto da conversa, próximos passos..."
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Btn type="submit" variante="primario" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar"}
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
