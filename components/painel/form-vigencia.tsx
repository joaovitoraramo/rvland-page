"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { EstadoNovaVigencia } from "@/app/painel/contratos/actions";

export function FormVigencia({
  acao,
  competencias,
}: {
  acao: (estado: EstadoNovaVigencia, formData: FormData) => Promise<EstadoNovaVigencia>;
  /** Próximas competências (valor ISO dia 1º + rótulo MM/AAAA). */
  competencias: { valor: string; rotulo: string }[];
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoNovaVigencia, FormData>(acao, {});

  return (
    <form action={dispatch} className="flex flex-wrap items-end gap-3">
      <div>
        <Label htmlFor="valor">Novo valor (R$)</Label>
        <Input
          id="valor"
          name="valor"
          placeholder="1.800,00"
          required
          className="w-36 border-white/10 bg-white/5 text-white placeholder:text-white/35"
        />
      </div>

      <div>
        <Label htmlFor="vigenteDesde">A partir da competência</Label>
        <Select id="vigenteDesde" name="vigenteDesde" className="w-40">
          {competencias.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo}
            </option>
          ))}
        </Select>
      </div>

      <Button
        type="submit"
        disabled={pendente}
        variant="secondary"
        className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
      >
        {pendente ? "Salvando..." : "Registrar vigência"}
      </Button>

      {estado.erro ? (
        <p role="alert" className="w-full text-sm text-red-300">
          {estado.erro}
        </p>
      ) : null}
      {estado.ok ? <p className="w-full text-sm text-emerald-300">{estado.ok}</p> : null}
    </form>
  );
}
