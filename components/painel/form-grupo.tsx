"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstadoGrupo } from "@/app/painel/config/actions";

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

  const estiloInput = "border-white/10 bg-white/5 text-white placeholder:text-white/35";

  return (
    <form action={dispatch} className="max-w-3xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="nome">Nome do grupo *</Label>
          <Input id="nome" name="nome" defaultValue={inicial?.nome ?? ""} required className={estiloInput} />
        </div>
        <div>
          <Label htmlFor="descricao">Descrição</Label>
          <Input id="descricao" name="descricao" defaultValue={inicial?.descricao ?? ""} className={estiloInput} />
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(areas).map(([area, permissoes]) => (
          <fieldset key={area} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <legend className="px-1 text-sm font-medium text-white/80">{area}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {permissoes.map((p) => (
                <label key={p.chave} className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    name="permissoes"
                    value={p.chave}
                    defaultChecked={selecionadas.has(p.chave)}
                    className="h-4 w-4 accent-cyan-400"
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

      <Button
        type="submit"
        disabled={pendente}
        className="rounded-xl bg-[rgba(0,229,255,0.18)] text-white hover:bg-[rgba(0,229,255,0.26)]"
      >
        {pendente ? "Salvando..." : "Salvar grupo"}
      </Button>
    </form>
  );
}
