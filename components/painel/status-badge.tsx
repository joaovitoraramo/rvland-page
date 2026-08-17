import { cn } from "@/lib/utils";
import type { StatusLicenca } from "@/lib/dominio/licenca";

const ESTILOS: Record<StatusLicenca, { rotulo: string; classe: string; ponto: string }> = {
  em_dia: {
    rotulo: "Em dia",
    classe: "border-[rgba(0,255,138,0.25)] bg-[rgba(0,255,138,0.10)] text-[rgba(150,255,200,0.95)]",
    ponto: "bg-[rgba(0,255,138,0.9)]",
  },
  atrasado: {
    rotulo: "Atrasado",
    classe: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    ponto: "bg-amber-400",
  },
  bloqueado: {
    rotulo: "Bloqueado",
    classe: "border-red-500/30 bg-red-500/10 text-red-200",
    ponto: "bg-red-500",
  },
  cancelado: {
    rotulo: "Cancelado",
    classe: "border-white/15 bg-white/5 text-white/55",
    ponto: "bg-white/40",
  },
  sem_licenca: {
    rotulo: "Sem licença",
    classe: "border-white/10 bg-white/[0.03] text-white/45",
    ponto: "bg-white/25",
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
  const rotulo =
    status === "bloqueado" && simulacao ? "Seria bloqueado" : estilo.rotulo;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        estilo.classe,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", estilo.ponto)} />
      {rotulo}
    </span>
  );
}
