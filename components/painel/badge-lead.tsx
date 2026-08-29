import { cn } from "@/lib/utils";
import type { StatusLead } from "@/lib/dominio/leads";

const MAPA: Record<StatusLead, { rotulo: string; classe: string }> = {
  novo: {
    rotulo: "Novo",
    classe: "border-[rgba(0,229,255,0.25)] bg-[rgba(0,229,255,0.08)] text-[#8AF0FF]",
  },
  em_conversa: {
    rotulo: "Em conversa",
    classe: "border-white/15 bg-white/5 text-white/80",
  },
  proposta: {
    rotulo: "Proposta",
    classe: "border-[rgba(255,194,77,0.25)] bg-[rgba(255,194,77,0.08)] text-[#FFD58A]",
  },
  ganho: {
    rotulo: "Ganho",
    classe: "border-[rgba(0,255,138,0.25)] bg-[rgba(0,255,138,0.08)] text-[#7DFFC4]",
  },
  perdido: {
    rotulo: "Perdido",
    classe: "border-white/10 bg-white/[0.03] text-white/35",
  },
};

export function BadgeLead({ status }: { status: StatusLead }) {
  const m = MAPA[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        m.classe
      )}
    >
      {m.rotulo}
    </span>
  );
}
