"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const estiloInput = "border-white/10 bg-white/5 text-white placeholder:text-white/35";

  return (
    <div className="space-y-4">
      {podeConfianca ? (
        <form action={dispatchConfianca} className="flex flex-wrap items-center gap-2">
          <Input
            name="dias"
            type="number"
            min={1}
            max={ehDono ? 365 : maxDias}
            defaultValue={diasConfianca || 2}
            className={`w-20 ${estiloInput}`}
            aria-label="Dias de confiança"
          />
          <Button
            type="submit"
            disabled={pendenteConfianca}
            variant="secondary"
            className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
          >
            {pendenteConfianca ? "..." : "Conceder confiança"}
          </Button>
          {!ehDono ? (
            <span className="text-xs text-white/40">máx. {maxDias} dias</span>
          ) : null}
          {estadoConfianca.erro ? (
            <p role="alert" className="w-full text-xs text-red-300">{estadoConfianca.erro}</p>
          ) : null}
          {estadoConfianca.ok ? (
            <p className="w-full text-xs text-emerald-300">{estadoConfianca.ok}</p>
          ) : null}
        </form>
      ) : null}

      {bloqueadoManual && podeDesbloquear ? (
        <form action={acaoDesbloquear}>
          <Button
            type="submit"
            className="rounded-xl bg-[rgba(0,255,138,0.16)] text-white hover:bg-[rgba(0,255,138,0.22)]"
          >
            Desbloquear
          </Button>
        </form>
      ) : null}

      {!bloqueadoManual && podeBloquear ? (
        <form action={dispatchBloquear} className="flex flex-wrap items-center gap-2">
          <Input
            name="motivo"
            placeholder="Motivo do bloqueio manual"
            className={`w-56 ${estiloInput}`}
          />
          <Button
            type="submit"
            disabled={pendenteBloquear}
            className="rounded-xl bg-red-500/15 text-red-200 hover:bg-red-500/25"
          >
            {pendenteBloquear ? "..." : "Bloquear manualmente"}
          </Button>
          {estadoBloquear.erro ? (
            <p role="alert" className="w-full text-xs text-red-300">{estadoBloquear.erro}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
