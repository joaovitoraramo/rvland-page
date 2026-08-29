"use client";

import * as React from "react";

import {
  mascararCompetencia,
  mascararDinheiro,
  mascararDinheiroUS,
  mascararDocumento,
  mascararTelefone,
} from "@/lib/dominio/mascaras";
import { cn } from "@/lib/utils";

/**
 * Inputs com máscara progressiva. O value submetido é o texto mascarado —
 * os parsers do servidor (reaisParaCentavos, parseCompetenciaHumana) já
 * entendem esses formatos.
 */

function useMascara(
  mascara: (texto: string) => string,
  valorInicial: string | undefined,
  aoMudar?: (mascarado: string) => void
) {
  const [valor, setValor] = React.useState(() => mascara(valorInicial ?? ""));

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const mascarado = mascara(e.target.value);
    setValor(mascarado);
    aoMudar?.(mascarado);
  };

  return { valor, onChange, setValor };
}

type PropsBase = Omit<React.ComponentProps<"input">, "value" | "onChange" | "defaultValue"> & {
  defaultValue?: string;
  aoMudar?: (valorMascarado: string) => void;
};

export function InputCompetencia({ defaultValue, aoMudar, className, ...props }: PropsBase) {
  const { valor, onChange } = useMascara(mascararCompetencia, defaultValue, aoMudar);
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="MM/AAAA"
      maxLength={7}
      value={valor}
      onChange={onChange}
      className={className}
      {...props}
    />
  );
}

export function InputDinheiro({ defaultValue, aoMudar, className, ...props }: PropsBase) {
  const { valor, onChange } = useMascara(mascararDinheiro, defaultValue, aoMudar);
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-white/35">
        R$
      </span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="0,00"
        value={valor}
        onChange={onChange}
        className="!pl-9"
        {...props}
      />
    </div>
  );
}

export function InputDocumento({ defaultValue, aoMudar, className, ...props }: PropsBase) {
  const { valor, onChange } = useMascara(mascararDocumento, defaultValue, aoMudar);
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="CPF ou CNPJ"
      value={valor}
      onChange={onChange}
      className={className}
      {...props}
    />
  );
}

export function InputTelefone({ defaultValue, aoMudar, className, ...props }: PropsBase) {
  const { valor, onChange } = useMascara(mascararTelefone, defaultValue, aoMudar);
  return (
    <input
      type="tel"
      inputMode="numeric"
      placeholder="(41) 99999-9999"
      value={valor}
      onChange={onChange}
      className={className}
      {...props}
    />
  );
}

export function InputDolar({ defaultValue, aoMudar, className, ...props }: PropsBase) {
  const { valor, onChange } = useMascara(mascararDinheiroUS, defaultValue, aoMudar);
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-white/35">
        $
      </span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="0.00"
        value={valor}
        onChange={onChange}
        className="!pl-8"
        {...props}
      />
    </div>
  );
}
