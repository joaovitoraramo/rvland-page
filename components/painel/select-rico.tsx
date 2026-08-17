"use client";

import * as React from "react";
import { Select } from "radix-ui";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type OpcaoRica = {
  valor: string;
  /** Linha principal (ex: nome do cliente). */
  titulo: string;
  /** Linha secundária (ex: título do contrato). */
  detalhe?: string;
  /** Etiqueta mono à direita (ex: "recorrente"). */
  tag?: string;
};

/**
 * Select custom do painel (Radix): trigger com cara de campo, popover escuro,
 * itens de duas linhas com check. Acessível por teclado e integrado a forms
 * (Radix rende um select nativo escondido com o `name`).
 */
export function SelectRico({
  opcoes,
  icone,
  placeholder = "Selecione...",
  id,
  name,
  value,
  onValueChange,
  onCloseAutoFocus,
  required,
  invalido,
  className,
}: {
  opcoes: OpcaoRica[];
  /** Ícone fixo à esquerda do trigger. */
  icone?: React.ReactNode;
  placeholder?: string;
  id?: string;
  name?: string;
  value?: string;
  onValueChange?: (valor: string) => void;
  /** Ao fechar, o Radix devolve o foco ao trigger; previna e redirecione aqui. */
  onCloseAutoFocus?: (event: Event) => void;
  required?: boolean;
  invalido?: boolean;
  className?: string;
}) {
  const selecionada = opcoes.find((o) => o.valor === value);

  return (
    <Select.Root value={value || undefined} onValueChange={onValueChange} name={name} required={required}>
      <Select.Trigger
        id={id}
        aria-invalid={invalido || undefined}
        className={cn(
          "flex h-10 w-full min-w-0 items-center gap-2.5 rounded-[10px] border px-3 text-left text-sm text-white outline-none transition-all",
          "border-white/[0.09] bg-white/[0.045]",
          "hover:border-white/20 hover:bg-white/[0.06]",
          "focus-visible:border-[rgba(0,229,255,0.5)] focus-visible:bg-white/[0.06] focus-visible:ring-[3px] focus-visible:ring-[rgba(0,229,255,0.16)]",
          "data-[state=open]:border-[rgba(0,229,255,0.5)] data-[state=open]:ring-[3px] data-[state=open]:ring-[rgba(0,229,255,0.16)]",
          invalido && "border-[rgba(255,93,93,0.55)]",
          className
        )}
      >
        {icone ? (
          <span className="shrink-0 text-white/35 [&_svg]:size-4">{icone}</span>
        ) : null}

        <span className="min-w-0 flex-1 truncate">
          {selecionada ? (
            <>
              <span className="text-white">{selecionada.titulo}</span>
              {selecionada.detalhe ? (
                <span className="text-white/45"> — {selecionada.detalhe}</span>
              ) : null}
            </>
          ) : (
            <span className="text-white/28">{placeholder}</span>
          )}
        </span>

        <Select.Icon className="shrink-0 text-white/35">
          <ChevronsUpDown className="size-4" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          onCloseAutoFocus={onCloseAutoFocus}
          className={cn(
            "painel rv-pop z-50 max-h-[320px] w-[var(--radix-select-trigger-width)] overflow-hidden",
            "rounded-xl border border-white/10 bg-[#0A0E14]/98 shadow-[0_24px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,229,255,0.06)] backdrop-blur-xl"
          )}
        >
          <Select.Viewport className="p-1.5">
            {opcoes.map((o) => (
              <Select.Item
                key={o.valor}
                value={o.valor}
                className={cn(
                  "group flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors",
                  "text-white/75 data-[highlighted]:bg-[rgba(0,229,255,0.08)] data-[highlighted]:text-white",
                  "data-[state=checked]:text-white"
                )}
              >
                <span className="min-w-0 flex-1">
                  <Select.ItemText>
                    <span className="block truncate font-medium leading-tight">{o.titulo}</span>
                  </Select.ItemText>
                  {o.detalhe ? (
                    <span className="block truncate text-xs leading-tight text-white/40">
                      {o.detalhe}
                    </span>
                  ) : null}
                </span>

                {o.tag ? <span className="rv-eyebrow shrink-0">{o.tag}</span> : null}

                <Select.ItemIndicator className="shrink-0 text-[#00FF8A]">
                  <Check className="size-4" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
