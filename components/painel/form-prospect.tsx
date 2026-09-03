"use client";

import * as React from "react";
import { useActionState } from "react";

import { Btn } from "@/components/painel/ui";
import { cn } from "@/lib/utils";
import {
  ETAPAS_FUNIL,
  ROTULO_STATUS_PROSPECT,
  type StatusProspect,
} from "@/lib/dominio/prospeccao";
import type { EstadoProspect } from "@/app/(app)/painel/prospeccao/actions";

/**
 * Etapas como trilha clicável em vez de select: o funil é curto e visual, e
 * mover o lead precisa ser um toque só — é o gesto mais repetido da tela.
 */
export function FormProspect({
  acao,
  statusAtual,
  notasAtuais,
}: {
  acao: (estado: EstadoProspect, formData: FormData) => Promise<EstadoProspect>;
  statusAtual: StatusProspect;
  notasAtuais: string;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoProspect, FormData>(acao, {});
  const [status, setStatus] = React.useState<StatusProspect>(statusAtual);
  const indiceAtual = ETAPAS_FUNIL.indexOf(status);

  return (
    <form action={dispatch} className="space-y-5">
      <input type="hidden" name="status" value={status} />

      <div>
        <div className="rv-eyebrow mb-2.5">etapa do funil</div>
        <div className="flex flex-wrap gap-1.5">
          {ETAPAS_FUNIL.map((etapa, i) => {
            const ativo = etapa === status;
            const passou = i < indiceAtual && etapa !== "perdido";
            const perdido = etapa === "perdido";
            const ganho = etapa === "ganho";
            return (
              <button
                key={etapa}
                type="button"
                onClick={() => setStatus(etapa)}
                aria-pressed={ativo}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-xs transition-all",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(0,229,255,0.3)]",
                  ativo && ganho && "border-[rgba(0,255,138,0.55)] bg-[rgba(0,255,138,0.2)] font-semibold text-[#7DFFC4]",
                  ativo && perdido && "border-red-500/40 bg-red-500/15 font-semibold text-red-200",
                  ativo && !ganho && !perdido && "border-[rgba(0,229,255,0.5)] bg-[rgba(0,229,255,0.14)] font-semibold text-white",
                  !ativo && passou && "border-white/12 bg-white/[0.06] text-white/60",
                  !ativo && !passou && "border-white/8 bg-white/[0.02] text-white/35 hover:text-white/70"
                )}
              >
                {ROTULO_STATUS_PROSPECT[etapa]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="rv-eyebrow mb-2 block" htmlFor="notas">
          notas da conversa
        </label>
        <textarea
          id="notas"
          name="notas"
          rows={6}
          defaultValue={notasAtuais}
          placeholder={
            "O que já foi dito, o que ele respondeu, próximo passo...\nEx: mandei a prévia dia 03, pediu para ver preço de manutenção."
          }
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
