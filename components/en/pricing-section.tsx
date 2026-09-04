"use client";

import * as React from "react";
import { ArrowRight, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatarDolares } from "@/lib/formato";
import { divisaoCare, totalPlano, type PricingEn } from "@/lib/dominio/preco-site";

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

  // a divisão vem do preço configurado: se o care mudar no painel, o texto
  // continua verdadeiro sozinho
  const divisao = divisaoCare(pricing.care.valorCentavos);

  return (
    <div className="mx-auto max-w-xl">
      {/* quem vem de um conceito já tem o desenho: aqui está o que falta */}
      <p className="rv-se-conceito mb-6 rounded-xl border border-[rgba(0,229,255,0.25)] bg-[rgba(0,229,255,0.07)] px-4 py-3 text-center text-sm text-[#8AF0FF]">
        You already have your concept. This is what it costs to put it live.
      </p>
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
        className="rv-precos-troca mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center backdrop-blur-md max-sm:mt-4 max-sm:p-5"
      >
        <div className="text-5xl font-semibold tracking-tight text-white max-sm:text-4xl md:text-6xl">
          {formatarDolares(plano.valorCentavos)}
          {parcelado ? (
            <span className="text-2xl font-normal text-white/50 max-sm:text-xl">/mo</span>
          ) : null}
        </div>
        <div className="rv-num mt-2 text-sm text-white/50">
          {parcelado
            ? `for ${parcelado.parcelas} months · ${formatarDolares(
                totalPlano(parcelado.valorCentavos, parcelado.parcelas)
              )} total`
            : "one-time payment"}
        </div>

        <ul className="mx-auto mt-6 grid max-w-md gap-x-6 gap-y-2 text-left text-sm text-white/70 max-sm:mt-4 max-sm:gap-y-1.5 max-sm:text-[13px] sm:grid-cols-2">
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
          className="mt-7 max-sm:mt-5 max-sm:w-full inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[rgba(0,255,138,0.16)] px-6 text-sm font-medium text-white transition-all hover:-translate-y-[1px] hover:bg-[rgba(0,255,138,0.22)]"
        >
          <span className="rv-sem-conceito">Get your free concept</span>
          <span className="rv-se-conceito">Let&apos;s build it</span>
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>

      <div className="mt-5 text-center max-sm:mt-4">
        <p className="text-sm text-white/55 max-sm:text-[13px]">
          Includes {pricing.care.mesesInclusos} months of support &amp; hosting. After
          that, {formatarDolares(pricing.care.valorCentavos)}/month.
        </p>
        {divisao ? (
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-white/35">
            Most of that is support: {formatarDolares(divisao.suporteCentavos)} for
            changes, questions and keeping the site current. Hosting is only{" "}
            {formatarDolares(divisao.hostingCentavos)} &mdash; and if you already have
            hosting, keep it and pay just the {formatarDolares(divisao.suporteCentavos)}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
