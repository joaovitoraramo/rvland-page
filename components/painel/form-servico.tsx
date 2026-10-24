"use client";

import * as React from "react";
import { useActionState } from "react";
import { Plus } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { Label } from "@/components/ui/label";
import type { EstadoServico } from "@/app/(app)/painel/servidores/actions";
import { ajudaServico, type SistemaServidor } from "@/lib/dominio/servidor-so";

export function FormServico({
  acao,
  so = "linux",
  sugestoes = [],
}: {
  acao: (estado: EstadoServico, formData: FormData) => Promise<EstadoServico>;
  so?: SistemaServidor;
  /** Windows: serviços que o agente encontrou no servidor */
  sugestoes?: { nome: string; exibicao: string }[];
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoServico, FormData>(acao, {});
  const [unidade, setUnidade] = React.useState("");
  const ajuda = ajudaServico(so);
  // até 8 sugestões que casem com o que foi digitado (nome ou exibição)
  const filtro = unidade.trim().toLowerCase();
  const casadas = sugestoes
    .filter((x) => !filtro || x.nome.toLowerCase().includes(filtro) || x.exibicao.toLowerCase().includes(filtro))
    .slice(0, 8);

  return (
    <form action={dispatch} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="nome">Rótulo</Label>
          <input id="nome" name="nome" placeholder="Backend" required />
        </div>
        <div>
          <Label htmlFor="unidade">{ajuda.rotulo}</Label>
          <input
            id="unidade"
            name="unidade"
            placeholder={ajuda.exemplo}
            required
            className="font-mono"
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-white/40">{ajuda.ajuda}</p>
        </div>
      </div>
      {so === "windows" && casadas.length > 0 ? (
        <div>
          <div className="rv-eyebrow mb-1.5">serviços encontrados neste servidor</div>
          <div className="flex flex-wrap gap-1.5">
            {casadas.map((x) => (
              <button
                key={x.nome}
                type="button"
                onClick={() => setUnidade(x.nome)}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-left font-mono text-[11px] text-white/70 transition-colors hover:border-white/25 hover:text-white"
              >
                {x.nome}
                {x.exibicao && x.exibicao !== x.nome ? <span className="ml-1.5 font-sans text-white/40">{x.exibicao}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-white/70">
        <input type="checkbox" name="licenciado" value="sim" defaultChecked />
        Licenciado — o bloqueio para este serviço
      </label>

      {estado.erro ? (
        <p role="alert" className="text-xs text-red-300">
          {estado.erro}
        </p>
      ) : null}
      {estado.ok ? <p className="text-xs text-emerald-300">{estado.ok}</p> : null}

      <Btn type="submit" tamanho="sm" disabled={pendente}>
        <Plus className="size-3.5" />
        {pendente ? "Adicionando..." : "Adicionar serviço"}
      </Btn>
    </form>
  );
}
