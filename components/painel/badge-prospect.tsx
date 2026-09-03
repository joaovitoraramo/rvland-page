import { cn } from "@/lib/utils";
import {
  ROTULO_STATUS_PROSPECT,
  type StatusProspect,
} from "@/lib/dominio/prospeccao";

/** Cor por etapa: frio no começo do funil, quente perto do fechamento. */
const CLASSE: Record<StatusProspect, string> = {
  novo: "border-white/12 bg-white/[0.05] text-white/55",
  seguindo: "border-[rgba(0,229,255,0.22)] bg-[rgba(0,229,255,0.07)] text-[#8AF0FF]",
  comentou: "border-[rgba(0,229,255,0.3)] bg-[rgba(0,229,255,0.11)] text-[#8AF0FF]",
  contatado: "border-[rgba(179,157,219,0.3)] bg-[rgba(179,157,219,0.12)] text-[#D1C4E9]",
  respondeu: "border-[rgba(255,194,77,0.28)] bg-[rgba(255,194,77,0.1)] text-[#FFD58A]",
  previa: "border-[rgba(255,194,77,0.4)] bg-[rgba(255,194,77,0.16)] text-[#FFD58A]",
  negociando: "border-[rgba(0,255,138,0.28)] bg-[rgba(0,255,138,0.1)] text-[#7DFFC4]",
  ganho: "border-[rgba(0,255,138,0.5)] bg-[rgba(0,255,138,0.2)] text-[#7DFFC4] font-semibold",
  perdido: "border-white/8 bg-white/[0.02] text-white/30",
};

export function BadgeProspect({
  status,
  className,
}: {
  status: StatusProspect;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        CLASSE[status],
        className
      )}
    >
      {ROTULO_STATUS_PROSPECT[status]}
    </span>
  );
}
