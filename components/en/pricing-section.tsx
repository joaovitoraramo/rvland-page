"use client";

import * as React from "react";
import { ArrowRight, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatarDolares } from "@/lib/formato";
import { totalPlano, type PricingEn } from "@/lib/dominio/preco-site";

type IdPlano = "full" | "m6" | "m12";

const ROTULOS: Record<IdPlano, string> = {
  full: "Pay in full",
  m6: "6 months",
  m12: "12 months",
};

const INCLUIDO = [
  "Custom website design",
  "Mobile responsive",
  "Basic SEO setup",
  "Google Maps integration",
  "Contact forms & leads",
  "SSL certificate & security",
  "Website hosting included",
  "Support & maintenance",
];

/** Seletor de três posições com pílula deslizante; valores vêm do painel. */
export function PricingSection({ pricing }: { pricing: PricingEn }) {
  const opcoes = (["full", "m6", "m12"] as const).filter(
    (id) => pricing.planos[id].ativo
  );
  const [ativo, setAtivo] = React.useState<IdPlano>(opcoes[0] ?? "full");
  const indice = Math.max(0, opcoes.indexOf(ativo));

  const plano = pricing.planos[ativo];
  const parcelado = ativo !== "full" ? pricing.planos[ativo as "m6" | "m12"] : null;

  const linhaCare = `Includes ${pricing.care.mesesInclusos} months of support & hosting. After that, just ${formatarDolares(pricing.care.valorCentavos)}/month.`;

  return (
    <div className="mx-auto max-w-xl">
      {/* seletor */}
      <div
        className="relative grid rounded-2xl border border-white/10 bg-black/30 p-1.5"
        style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}
      >
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-1.5 rounded-xl bg-gradient-to-r from-[rgba(0,229,255,0.22)] to-[rgba(0,255,138,0.18)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-transform duration-300 ease-out"
          style={{
            width: `calc((100% - 0.75rem) / ${opcoes.length})`,
            transform: `translateX(${indice * 100}%)`,
          }}
        />
        {opcoes.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setAtivo(id)}
            aria-pressed={ativo === id}
            className={cn(
              "relative z-10 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              ativo === id ? "text-white" : "text-white/50 hover:text-white/80"
            )}
          >
            {ROTULOS[id]}
          </button>
        ))}
      </div>

      {/* valor */}
      <div
        key={ativo}
        className="rv-precos-troca mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center backdrop-blur-md"
      >
        <div className="text-5xl font-semibold tracking-tight text-white md:text-6xl">
          {formatarDolares(plano.valorCentavos)}
          {parcelado ? (
            <span className="text-2xl font-normal text-white/50">/mo</span>
          ) : null}
        </div>
        <div className="rv-num mt-2 text-sm text-white/50">
          {parcelado
            ? `for ${parcelado.parcelas} months · ${formatarDolares(
                totalPlano(parcelado.valorCentavos, parcelado.parcelas)
              )} total`
            : "one-time payment"}
        </div>

        <ul className="mx-auto mt-6 grid max-w-md gap-x-6 gap-y-2 text-left text-sm text-white/70 sm:grid-cols-2">
          {INCLUIDO.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgba(0,255,138,0.9)]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <a
          href="#contact"
          onClick={() => {
            // guarda o plano selecionado para o lead — captura silenciosa
            try {
              sessionStorage.setItem("rv-plano-interesse", ativo);
            } catch {
              /* storage bloqueado: lead segue sem interesse */
            }
          }}
          className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[rgba(0,255,138,0.16)] px-6 text-sm font-medium text-white transition-all hover:-translate-y-[1px] hover:bg-[rgba(0,255,138,0.22)]"
        >
          Get your free concept
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>

      <p className="mt-5 text-center text-sm text-white/55">{linhaCare}</p>
    </div>
  );
}
