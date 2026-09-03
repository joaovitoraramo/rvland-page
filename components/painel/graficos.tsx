import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Gráficos do painel em SVG/CSS puro. Sem biblioteca de charts de propósito:
 * o vocabulário visual daqui é bem específico (fósforo sobre fundo escuro) e
 * qualquer lib traria mais peso e menos controle do que estas ~150 linhas.
 */

export type Fatia = { rotulo: string; qtd: number };

const TONS = [
  "from-[#00E5FF] to-[#00B8D4]",
  "from-[#00FF8A] to-[#00C853]",
  "from-[#8AF0FF] to-[#00E5FF]",
  "from-[#FFD58A] to-[#E8A33D]",
  "from-[#B39DDB] to-[#7E57C2]",
  "from-white/40 to-white/25",
] as const;

export function BarrasHorizontais({
  dados,
  limite = 8,
  formatarValor,
}: {
  dados: Fatia[];
  limite?: number;
  formatarValor?: (qtd: number) => string;
}) {
  const visiveis = dados.slice(0, limite);
  const maximo = Math.max(1, ...visiveis.map((d) => d.qtd));

  if (visiveis.length === 0) {
    return <p className="py-6 text-center text-sm text-white/35">Sem dados ainda.</p>;
  }

  return (
    <div className="space-y-2.5">
      {visiveis.map((d, i) => (
        <div key={d.rotulo} className="grid grid-cols-[minmax(0,7.5rem)_1fr_2.5rem] items-center gap-3">
          <span className="truncate text-xs text-white/60" title={d.rotulo}>
            {d.rotulo}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <span
              className={cn("block h-full rounded-full bg-gradient-to-r", TONS[i % TONS.length])}
              style={{ width: `${Math.max(3, (d.qtd / maximo) * 100)}%` }}
            />
          </span>
          <span className="rv-num text-right text-xs text-white/70">
            {formatarValor ? formatarValor(d.qtd) : d.qtd}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Funil comercial: largura proporcional, com a taxa de passagem entre etapas. */
export function Funil({ etapas }: { etapas: { rotulo: string; qtd: number; cor?: string }[] }) {
  const topo = Math.max(1, etapas[0]?.qtd ?? 1);

  return (
    <div className="space-y-1.5">
      {etapas.map((e, i) => {
        const largura = Math.max(8, (e.qtd / topo) * 100);
        const anterior = etapas[i - 1]?.qtd;
        const taxa = anterior && anterior > 0 ? Math.round((e.qtd / anterior) * 100) : null;
        return (
          <div key={e.rotulo} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-xs text-white/55">{e.rotulo}</span>
            <span className="relative h-7 flex-1 overflow-hidden rounded-lg bg-white/[0.04]">
              <span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r transition-all",
                  e.cor ?? "from-[rgba(0,229,255,0.35)] to-[rgba(0,255,138,0.25)]"
                )}
                style={{ width: `${largura}%` }}
              />
              <span className="rv-num absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-white">
                {e.qtd}
              </span>
            </span>
            <span className="rv-num w-12 shrink-0 text-right text-[11px] text-white/35">
              {taxa === null ? "" : `${taxa}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Rosca em SVG: uma volta, fatias por stroke-dasharray. */
export function Rosca({
  dados,
  centroRotulo,
  centroValor,
}: {
  dados: (Fatia & { cor: string })[];
  centroRotulo?: string;
  centroValor?: string | number;
}) {
  const total = dados.reduce((s, d) => s + d.qtd, 0);
  const raio = 52;
  const circunferencia = 2 * Math.PI * raio;
  let acumulado = 0;

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" className="size-32 shrink-0 -rotate-90">
        <circle cx="70" cy="70" r={raio} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16" />
        {total > 0 &&
          dados.map((d) => {
            const fracao = d.qtd / total;
            const traco = fracao * circunferencia;
            const el = (
              <circle
                key={d.rotulo}
                cx="70"
                cy="70"
                r={raio}
                fill="none"
                stroke={d.cor}
                strokeWidth="16"
                strokeDasharray={`${traco} ${circunferencia - traco}`}
                strokeDashoffset={-acumulado}
                strokeLinecap="butt"
              />
            );
            acumulado += traco;
            return el;
          })}
      </svg>

      <div className="min-w-0 flex-1 space-y-2">
        {centroValor !== undefined ? (
          <div className="mb-3">
            <div className="rv-num text-2xl font-semibold leading-none text-white">{centroValor}</div>
            {centroRotulo ? <div className="rv-eyebrow mt-1">{centroRotulo}</div> : null}
          </div>
        ) : null}
        {dados.map((d) => (
          <div key={d.rotulo} className="flex items-center gap-2 text-xs">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.cor }} />
            <span className="min-w-0 flex-1 truncate text-white/60">{d.rotulo}</span>
            <span className="rv-num text-white/80">{d.qtd}</span>
            <span className="rv-num w-9 text-right text-white/35">
              {total > 0 ? `${Math.round((d.qtd / total) * 100)}%` : "0%"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Medidor 1-10 do potencial: dez blocos, os preenchidos ganham cor da faixa. */
export function MedidorPotencial({ valor, tamanho = "md" }: { valor: number; tamanho?: "sm" | "md" }) {
  const cor =
    valor >= 8
      ? "bg-[#00FF8A]"
      : valor >= 6
        ? "bg-[#FFC24D]"
        : "bg-white/30";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("flex gap-[2px]", tamanho === "sm" ? "h-2.5" : "h-3.5")}>
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-[1px] transition-colors",
              i < valor ? cor : "bg-white/[0.08]"
            )}
          />
        ))}
      </span>
      <span
        className={cn(
          "rv-num font-semibold",
          tamanho === "sm" ? "text-xs" : "text-sm",
          valor >= 8 ? "text-[#7DFFC4]" : valor >= 6 ? "text-[#FFD58A]" : "text-white/45"
        )}
      >
        {valor}
      </span>
    </span>
  );
}

export function CardGrafico({
  titulo,
  dica,
  children,
  className,
}: {
  titulo: string;
  dica?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.055] to-white/[0.028] p-5",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
        className
      )}
    >
      <div className="mb-4">
        <div className="text-sm font-medium text-white">{titulo}</div>
        {dica ? <div className="mt-0.5 text-xs text-white/40">{dica}</div> : null}
      </div>
      {children}
    </div>
  );
}
