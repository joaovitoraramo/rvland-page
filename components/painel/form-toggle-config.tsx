"use client";

import * as React from "react";
import { useActionState } from "react";

import { Btn } from "@/components/painel/ui";
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
    <form action={dispatch} className="space-y-3">
      <p className="text-xs text-white/40">
        Digite <strong className="rv-num text-white/80">{palavra}</strong> para confirmar.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="confirmacao"
          placeholder={palavra}
          autoComplete="off"
          className="rv-num !w-44 uppercase"
        />
        <Btn type="submit" variante={perigoso ? "perigo" : "secundario"} disabled={pendente}>
          {pendente ? "..." : ligado ? rotuloDesligar : rotuloLigar}
        </Btn>
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
      <input
        name="dias"
        type="number"
        inputMode="numeric"
        min={0}
        max={90}
        defaultValue={atual}
        className="!w-24"
        aria-label="Teto de dias de confiança"
      />
      <Btn type="submit" disabled={pendente}>
        {pendente ? "..." : "Salvar teto"}
      </Btn>
      {estado.erro ? (
        <p role="alert" className="w-full text-xs text-red-300">
          {estado.erro}
        </p>
      ) : null}
      {estado.ok ? <p className="w-full text-xs text-emerald-300">{estado.ok}</p> : null}
    </form>
  );
}
