import * as React from "react";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Primitivos visuais do painel. A landing tem os dela — aqui o vocabulário
 * é de console: um único botão brilhante por tela, o resto quieto.
 */

type VarianteBtn = "primario" | "secundario" | "perigo" | "fantasma";
type TamanhoBtn = "md" | "sm" | "icone";

const VARIANTES: Record<VarianteBtn, string> = {
  primario: [
    "bg-gradient-to-r from-[#00E5FF] to-[#00FF8A] text-[#05070B] font-semibold",
    "shadow-[0_4px_20px_rgba(0,229,255,0.25)]",
    "hover:brightness-110 hover:shadow-[0_4px_28px_rgba(0,229,255,0.35)]",
    "active:brightness-95",
  ].join(" "),
  secundario:
    "border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-white/20",
  perigo:
    "border border-red-500/20 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:border-red-500/30",
  fantasma: "text-white/60 hover:text-white hover:bg-white/5",
};

const TAMANHOS: Record<TamanhoBtn, string> = {
  md: "h-10 px-4 text-sm rounded-[10px] gap-2",
  sm: "h-8 px-3 text-[13px] rounded-lg gap-1.5",
  icone: "size-9 rounded-[10px]",
};

export function Btn({
  variante = "secundario",
  tamanho = "md",
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  variante?: VarianteBtn;
  tamanho?: TamanhoBtn;
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-medium transition-all",
        "outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(0,229,255,0.3)]",
        "active:scale-[0.98] motion-reduce:active:scale-100",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        VARIANTES[variante],
        TAMANHOS[tamanho],
        className
      )}
      {...props}
    />
  );
}

export function Avatar({ nome, className }: { nome: string; className?: string }) {
  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full",
        "bg-gradient-to-br from-[rgba(0,229,255,0.25)] to-[rgba(0,255,138,0.2)]",
        "border border-white/15 font-mono text-xs font-semibold text-white",
        className
      )}
      aria-hidden
    >
      {iniciais || "?"}
    </span>
  );
}

export function Kpi({
  icone,
  rotulo,
  valor,
  tom = "neutro",
  sub,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  tom?: "verde" | "ambar" | "ciano" | "neutro";
  sub?: string;
}) {
  const tons = {
    verde: "rv-fosforo-verde",
    ambar: "rv-fosforo-ambar",
    ciano: "rv-fosforo-ciano",
    neutro: "text-white",
  } as const;

  const iconeTons = {
    verde: "border-[rgba(0,255,138,0.2)] bg-[rgba(0,255,138,0.08)] text-[#7DFFC4]",
    ambar: "border-[rgba(255,194,77,0.2)] bg-[rgba(255,194,77,0.08)] text-[#FFD58A]",
    ciano: "border-[rgba(0,229,255,0.2)] bg-[rgba(0,229,255,0.08)] text-[#8AF0FF]",
    neutro: "border-white/10 bg-white/5 text-white/80",
  } as const;

  return (
    <div className="rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.055] to-white/[0.028] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-8 place-items-center rounded-lg border [&_svg]:size-4",
            iconeTons[tom]
          )}
        >
          {icone}
        </span>
        <span className="rv-eyebrow">{rotulo}</span>
      </div>
      <div className={cn("rv-num mt-3 text-[26px] font-semibold leading-none", tons[tom])}>
        {valor}
      </div>
      {sub ? <div className="mt-2 text-xs text-white/40">{sub}</div> : null}
    </div>
  );
}

export function EmptyState({
  icone,
  titulo,
  dica,
  acao,
}: {
  icone: React.ReactNode;
  titulo: string;
  dica?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white/40 [&_svg]:size-5">
        {icone}
      </span>
      <div>
        <div className="text-sm font-medium text-white/80">{titulo}</div>
        {dica ? <div className="mt-1 text-sm text-white/40">{dica}</div> : null}
      </div>
      {acao}
    </div>
  );
}
