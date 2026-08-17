"use client";

import * as React from "react";
import { useActionState } from "react";
import { LockOpen, ShieldBan, Timer } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import type { EstadoAcaoLicenca } from "@/app/painel/clientes/actions";

export function AcoesLicenca({
  podeConfianca,
  podeBloquear,
  podeDesbloquear,
  bloqueadoManual,
  diasConfianca,
  maxDias,
  ehDono,
  acaoConfianca,
  acaoBloquear,
  acaoDesbloquear,
}: {
  podeConfianca: boolean;
  podeBloquear: boolean;
  podeDesbloquear: boolean;
  bloqueadoManual: boolean;
  diasConfianca: number;
  maxDias: number;
  ehDono: boolean;
  acaoConfianca: (estado: EstadoAcaoLicenca, formData: FormData) => Promise<EstadoAcaoLicenca>;
  acaoBloquear: (estado: EstadoAcaoLicenca, formData: FormData) => Promise<EstadoAcaoLicenca>;
  acaoDesbloquear: () => Promise<void>;
}) {
  const [estadoConfianca, dispatchConfianca, pendenteConfianca] = useActionState<
    EstadoAcaoLicenca,
    FormData
  >(acaoConfianca, {});
  const [estadoBloquear, dispatchBloquear, pendenteBloquear] = useActionState<
    EstadoAcaoLicenca,
    FormData
  >(acaoBloquear, {});

  return (
    <div className="space-y-4 border-t border-white/8 pt-4">
      {podeConfianca ? (
        <form action={dispatchConfianca} className="flex flex-wrap items-center gap-2">
          <input
            name="dias"
            type="number"
            inputMode="numeric"
            min={1}
            max={ehDono ? 365 : maxDias}
            defaultValue={diasConfianca || 2}
            className="!w-20"
            aria-label="Dias de confiança"
          />
          <Btn type="submit" tamanho="sm" disabled={pendenteConfianca}>
            <Timer className="size-3.5" />
            {pendenteConfianca ? "..." : "Conceder confiança"}
          </Btn>
          {!ehDono ? <span className="text-xs text-white/35">máx. {maxDias} dias</span> : null}
          {estadoConfianca.erro ? (
            <p role="alert" className="w-full text-xs text-red-300">
              {estadoConfianca.erro}
            </p>
          ) : null}
          {estadoConfianca.ok ? (
            <p className="w-full text-xs text-emerald-300">{estadoConfianca.ok}</p>
          ) : null}
        </form>
      ) : null}

      {bloqueadoManual && podeDesbloquear ? (
        <form action={acaoDesbloquear}>
          <Btn type="submit" variante="primario" tamanho="sm">
            <LockOpen className="size-3.5" />
            Desbloquear
          </Btn>
        </form>
      ) : null}

      {!bloqueadoManual && podeBloquear ? (
        <form action={dispatchBloquear} className="flex flex-wrap items-center gap-2">
          <input name="motivo" placeholder="Motivo do bloqueio manual" className="!w-56" />
          <Btn type="submit" variante="perigo" tamanho="sm" disabled={pendenteBloquear}>
            <ShieldBan className="size-3.5" />
            {pendenteBloquear ? "..." : "Bloquear"}
          </Btn>
          {estadoBloquear.erro ? (
            <p role="alert" className="w-full text-xs text-red-300">
              {estadoBloquear.erro}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
