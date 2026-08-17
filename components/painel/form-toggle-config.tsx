"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoConfig } from "@/app/painel/config/actions";

/** Toggle com confirmação textual (pânico / simulação). */
export function FormToggleConfig({
  acao,
  ligado,
  palavraLigar,
  palavraDesligar,
  rotuloLigar,
  rotuloDesligar,
  perigoso,
}: {
  acao: (estado: EstadoConfig, formData: FormData) => Promise<EstadoConfig>;
  ligado: boolean;
  palavraLigar: string;
  palavraDesligar: string;
  rotuloLigar: string;
  rotuloDesligar: string;
  /** Pinta o botão de vermelho quando a ação é a perigosa. */
  perigoso: boolean;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoConfig, FormData>(acao, {});
  const palavra = ligado ? palavraDesligar : palavraLigar;

  return (
    <form action={dispatch} className="space-y-2">
      <p className="text-xs text-white/45">
        Digite <strong className="text-white/80">{palavra}</strong> para confirmar.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="confirmacao"
          placeholder={palavra}
          autoComplete="off"
          className="w-40 border-white/10 bg-white/5 text-white placeholder:text-white/25"
        />
        <Button
          type="submit"
          disabled={pendente}
          className={
            perigoso
              ? "rounded-xl bg-red-500/15 text-red-200 hover:bg-red-500/25"
              : "rounded-xl bg-[rgba(0,255,138,0.16)] text-white hover:bg-[rgba(0,255,138,0.22)]"
          }
        >
          {pendente ? "..." : ligado ? rotuloDesligar : rotuloLigar}
        </Button>
      </div>
      {estado.erro ? (
        <p role="alert" className="text-xs text-red-300">
          {estado.erro}
        </p>
      ) : null}
      {estado.ok ? <p className="text-xs text-emerald-300">{estado.ok}</p> : null}
    </form>
  );
}

export function FormTetoConfianca({
  acao,
  atual,
}: {
  acao: (estado: EstadoConfig, formData: FormData) => Promise<EstadoConfig>;
  atual: number;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoConfig, FormData>(acao, {});

  return (
    <form action={dispatch} className="flex flex-wrap items-center gap-2">
      <Input
        name="dias"
        type="number"
        min={0}
        max={90}
        defaultValue={atual}
        className="w-24 border-white/10 bg-white/5 text-white"
        aria-label="Teto de dias de confiança"
      />
      <Button
        type="submit"
        disabled={pendente}
        variant="secondary"
        className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
      >
        {pendente ? "..." : "Salvar teto"}
      </Button>
      {estado.erro ? (
        <p role="alert" className="w-full text-xs text-red-300">
          {estado.erro}
        </p>
      ) : null}
      {estado.ok ? <p className="w-full text-xs text-emerald-300">{estado.ok}</p> : null}
    </form>
  );
}
