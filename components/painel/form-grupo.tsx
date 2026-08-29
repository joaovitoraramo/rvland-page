"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { Label } from "@/components/ui/label";
import type { EstadoGrupo } from "@/app/(app)/painel/config/actions";

export function FormGrupo({
  acao,
  inicial,
  areas,
}: {
  acao: (estado: EstadoGrupo, formData: FormData) => Promise<EstadoGrupo>;
  inicial?: { nome: string; descricao: string | null; permissoes: string[] };
  areas: Record<string, { chave: string; rotulo: string }[]>;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoGrupo, FormData>(acao, {});
  const selecionadas = new Set(inicial?.permissoes ?? []);

  return (
    <form action={dispatch} className="max-w-3xl space-y-5">
      <div className="rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.045] to-white/[0.02] p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="nome">Nome do grupo *</Label>
            <input id="nome" name="nome" defaultValue={inicial?.nome ?? ""} required />
          </div>
          <div>
            <Label htmlFor="descricao">Descrição</Label>
            <input id="descricao" name="descricao" defaultValue={inicial?.descricao ?? ""} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {Object.entries(areas).map(([area, permissoes]) => (
          <fieldset
            key={area}
            className="rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.04] to-white/[0.02] p-5"
          >
            <legend className="rv-eyebrow px-1">{area}</legend>
            <div className="mt-1 space-y-2.5">
              {permissoes.map((p) => (
                <label
                  key={p.chave}
                  className="flex cursor-pointer items-center gap-2.5 text-sm text-white/70 transition-colors hover:text-white"
                >
                  <input
                    type="checkbox"
                    name="permissoes"
                    value={p.chave}
                    defaultChecked={selecionadas.has(p.chave)}
                  />
                  {p.rotulo}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {estado.erro ? (
        <p role="alert" className="text-sm text-red-300">
          {estado.erro}
        </p>
      ) : null}

      <Btn type="submit" variante="primario" disabled={pendente}>
        {pendente ? "Salvando..." : "Salvar grupo"}
        {!pendente ? <Check className="size-4" /> : null}
      </Btn>
    </form>
  );
}
