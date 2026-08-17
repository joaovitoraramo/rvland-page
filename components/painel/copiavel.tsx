"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/** Bloco mono com botão de copiar. Para token e comando de instalação. */
export function Copiavel({
  valor,
  rotulo,
  className,
}: {
  valor: string;
  rotulo?: string;
  className?: string;
}) {
  const [copiado, setCopiado] = React.useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      /* clipboard indisponível — o usuário seleciona manualmente */
    }
  };

  return (
    <div className={className}>
      {rotulo ? <div className="rv-eyebrow mb-1.5">{rotulo}</div> : null}
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-xs text-white/80">
          {valor}
        </code>
        <button
          type="button"
          onClick={copiar}
          aria-label="Copiar"
          className={cn(
            "grid w-10 shrink-0 place-items-center rounded-lg border transition-colors",
            copiado
              ? "border-[rgba(0,255,138,0.3)] bg-[rgba(0,255,138,0.12)] text-[#7DFFC4]"
              : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"
          )}
        >
          {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}
