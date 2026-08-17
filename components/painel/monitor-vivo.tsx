"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Indicador "ao vivo": conta o tempo desde a última leitura (tick client-side,
 * sem tocar o relógio no render) e recarrega os dados do servidor no intervalo,
 * para o painel refletir o heartbeat sem recarregar a página na mão.
 */
export function MonitorVivo({
  segundosIniciais,
  intervaloMs = 60000,
}: {
  segundosIniciais: number | null;
  intervaloMs?: number;
}) {
  const router = useRouter();
  const [extra, setExtra] = React.useState(0);

  React.useEffect(() => {
    const tick = setInterval(() => setExtra((e) => e + 1), 1000);
    const refresh = setInterval(() => {
      router.refresh();
      setExtra(0);
    }, intervaloMs);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router, intervaloMs]);

  const total = segundosIniciais == null ? null : segundosIniciais + extra;
  const texto =
    total == null
      ? "atualização automática"
      : total < 60
        ? `última leitura há ${total}s`
        : `última leitura há ${Math.floor(total / 60)}min`;

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,255,138,0.2)] bg-[rgba(0,255,138,0.06)] px-2.5 py-1 font-mono text-[11px] text-[#7DFFC4]">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#00FF8A] opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-[#00FF8A]" />
      </span>
      ao vivo · {texto}
    </span>
  );
}
