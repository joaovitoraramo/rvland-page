import { cn } from "@/lib/utils";
import type { StatusServidor } from "@/lib/dominio/servidor";

const ESTILOS: Record<StatusServidor, { rotulo: string; classe: string; ponto: string; glow: string }> = {
  online: {
    rotulo: "Online",
    classe: "border-[rgba(0,255,138,0.22)] bg-[rgba(0,255,138,0.08)] text-[#7DFFC4]",
    ponto: "bg-[#00FF8A]",
    glow: "0 0 8px rgba(0,255,138,0.8)",
  },
  offline: {
    rotulo: "Offline",
    classe: "border-[rgba(255,93,93,0.3)] bg-[rgba(255,93,93,0.09)] text-[#FF9D9D]",
    ponto: "bg-[#FF5D5D]",
    glow: "0 0 8px rgba(255,93,93,0.8)",
  },
  pendente: {
    rotulo: "Aguardando enroll",
    classe: "border-[rgba(255,194,77,0.25)] bg-[rgba(255,194,77,0.08)] text-[#FFD58A]",
    ponto: "bg-[#FFC24D]",
    glow: "0 0 8px rgba(255,194,77,0.8)",
  },
  revogado: {
    rotulo: "Revogado",
    classe: "border-white/12 bg-white/[0.04] text-white/45",
    ponto: "bg-white/30",
    glow: "none",
  },
};

export function BadgeServidor({
  status,
  className,
}: {
  status: StatusServidor;
  className?: string;
}) {
  const e = ESTILOS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1",
        "font-mono text-[11px] font-medium uppercase tracking-[0.06em]",
        e.classe,
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", e.ponto)} style={{ boxShadow: e.glow }} />
      {e.rotulo}
    </span>
  );
}
