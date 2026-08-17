"use client";

import * as React from "react";
import { useActionState } from "react";
import { Plus } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { Label } from "@/components/ui/label";
import type { EstadoServico } from "@/app/painel/servidores/actions";

export function FormServico({
  acao,
}: {
  acao: (estado: EstadoServico, formData: FormData) => Promise<EstadoServico>;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoServico, FormData>(acao, {});

  return (
    <form action={dispatch} className="space-y-3 border-t border-white/8 pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="nome">Rótulo</Label>
          <input id="nome" name="nome" placeholder="Backend" required />
        </div>
        <div>
          <Label htmlFor="unidade">Unidade systemd</Label>
          <input
            id="unidade"
            name="unidade"
            placeholder="concicredit.service"
            required
            className="font-mono"
          />
        </div>
      </div>
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
