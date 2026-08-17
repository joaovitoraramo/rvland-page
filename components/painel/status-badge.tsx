import { cn } from "@/lib/utils";
import type { StatusLicenca } from "@/lib/dominio/licenca";

const ESTILOS: Record<
  StatusLicenca,
  { rotulo: string; classe: string; ponto: string; brilho: string }
> = {
  em_dia: {
    rotulo: "Em dia",
    classe: "border-[rgba(0,255,138,0.22)] bg-[rgba(0,255,138,0.08)] text-[#7DFFC4]",
    ponto: "bg-[#00FF8A]",
    brilho: "0 0 8px rgba(0,255,138,0.8)",
  },
  atrasado: {
    rotulo: "Atrasado",
    classe: "border-[rgba(255,194,77,0.25)] bg-[rgba(255,194,77,0.08)] text-[#FFD58A]",
    ponto: "bg-[#FFC24D]",
    brilho: "0 0 8px rgba(255,194,77,0.8)",
  },
  bloqueado: {
    rotulo: "Bloqueado",
    classe: "border-[rgba(255,93,93,0.3)] bg-[rgba(255,93,93,0.09)] text-[#FF9D9D]",
    ponto: "bg-[#FF5D5D]",
    brilho: "0 0 8px rgba(255,93,93,0.8)",
  },
  cancelado: {
    rotulo: "Cancelado",
    classe: "border-white/12 bg-white/[0.04] text-white/50",
    ponto: "bg-white/35",
    brilho: "none",
  },
  sem_licenca: {
    rotulo: "Sem licença",
    classe: "border-white/8 bg-white/[0.02] text-white/40",
    ponto: "bg-white/20",
    brilho: "none",
  },
};

export function StatusBadge({
  status,
  simulacao,
  className,
}: {
  status: StatusLicenca;
  /** Em modo simulação, bloqueado é exibido como intenção, não como fato. */
  simulacao?: boolean;
  className?: string;
}) {
  const estilo = ESTILOS[status];
  const rotulo = status === "bloqueado" && simulacao ? "Seria bloqueado" : estilo.rotulo;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1",
        "font-mono text-[11px] font-medium uppercase tracking-[0.06em]",
        estilo.classe,
        className
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", estilo.ponto)}
        style={{ boxShadow: estilo.brilho }}
      />
      {rotulo}
    </span>
  );
}
