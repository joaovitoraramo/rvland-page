import * as React from "react";

export function PageHeader({
  trilha,
  titulo,
  descricao,
  acoes,
}: {
  /** Caminho mono da tela, ex: "clientes / novo". */
  trilha?: string;
  titulo: string;
  descricao?: string;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="rv-entrar mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 md:mb-7">
      <div className="min-w-0 max-md:w-full">
        {trilha ? <div className="rv-eyebrow mb-2">rv / {trilha}</div> : null}
        <h1 className="truncate text-xl font-semibold tracking-tight text-white md:text-2xl">
          {titulo}
        </h1>
        {descricao ? <p className="mt-1.5 text-sm text-white/55">{descricao}</p> : null}
      </div>
      {/* mobile: ações quebram em linha própria e envolvem; desktop: à direita */}
      {acoes ? (
        <div className="flex flex-wrap items-center gap-2 max-md:w-full md:shrink-0">{acoes}</div>
      ) : null}
    </div>
  );
}
