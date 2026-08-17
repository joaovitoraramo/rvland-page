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
    <div className="rv-entrar mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {trilha ? <div className="rv-eyebrow mb-2">rv / {trilha}</div> : null}
        <h1 className="truncate text-2xl font-semibold tracking-tight text-white">
          {titulo}
        </h1>
        {descricao ? <p className="mt-1.5 text-sm text-white/55">{descricao}</p> : null}
      </div>
      {acoes ? <div className="flex shrink-0 items-center gap-2">{acoes}</div> : null}
    </div>
  );
}
