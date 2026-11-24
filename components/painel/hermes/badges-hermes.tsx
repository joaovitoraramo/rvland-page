import { cn } from "@/lib/utils";
import { ROTULO_STATUS_LICENCA, type SituacaoChave } from "@/lib/hermes/painel";
import type { StatusHermes } from "@/lib/hermes/licenca";
import type { CanalHermes, ModoHermes } from "@/lib/hermes/documento";
import type { StatusInstalacao } from "@/lib/servicos/hermes-tipos";

/** Chips de estado do Hermes. Cor + texto (nunca só cor) e sem `title=`. */

const base = "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-medium";

const VERDE = "border-[rgba(0,255,138,0.25)] bg-[rgba(0,255,138,0.08)] text-[#7DFFC4]";
const AMBAR = "border-amber-400/30 bg-amber-400/10 text-[#FFD58A]";
const VERMELHO = "border-red-500/30 bg-red-500/10 text-red-200";
const CIANO = "border-[rgba(0,229,255,0.3)] bg-[rgba(0,229,255,0.08)] text-[#8AF0FF]";
const NEUTRO = "border-white/10 bg-white/5 text-white/55";

const TOM_LICENCA: Record<StatusHermes, string> = {
  ativa: VERDE,
  carencia: AMBAR,
  vencida: VERMELHO,
  bloqueada: VERMELHO,
  revogada: VERMELHO,
  sem_contrato: VERMELHO,
  cancelada: VERMELHO,
};

export function BadgeLicencaHermes({ status, className }: { status: StatusHermes; className?: string }) {
  return <span className={cn(base, TOM_LICENCA[status], className)}>{ROTULO_STATUS_LICENCA[status]}</span>;
}

/** Simulação nunca bloqueia; valendo bloqueia de verdade (se a licença for bloqueante). */
export function BadgeModoHermes({ modo, className }: { modo: ModoHermes; className?: string }) {
  return (
    <span className={cn(base, modo === "valendo" ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : CIANO, className)}>
      {modo === "valendo" ? "Valendo" : "Simulação"}
    </span>
  );
}

export function BadgeCanalHermes({ canal, className }: { canal: CanalHermes; className?: string }) {
  return <span className={cn(base, "font-mono", canal === "preview" ? AMBAR : NEUTRO, className)}>{canal}</span>;
}

const STATUS_INSTALACAO: Record<StatusInstalacao, { texto: string; classe: string }> = {
  ativa: { texto: "Ativa", classe: VERDE },
  aguardando_ativacao: { texto: "Aguardando ativação", classe: AMBAR },
  revogada: { texto: "Revogada", classe: VERMELHO },
  desinstalada: { texto: "Desinstalada", classe: NEUTRO },
};

export function BadgeInstalacaoHermes({ status, className }: { status: StatusInstalacao; className?: string }) {
  const m = STATUS_INSTALACAO[status];
  return <span className={cn(base, m.classe, className)}>{m.texto}</span>;
}

const SITUACAO_CHAVE: Record<SituacaoChave, { texto: string; classe: string }> = {
  ativa: { texto: "Aberta", classe: VERDE },
  usada: { texto: "Usada", classe: CIANO },
  expirada: { texto: "Expirada", classe: NEUTRO },
  revogada: { texto: "Revogada", classe: VERMELHO },
};

export function BadgeChaveHermes({ situacao, className }: { situacao: SituacaoChave; className?: string }) {
  const m = SITUACAO_CHAVE[situacao];
  return <span className={cn(base, m.classe, className)}>{m.texto}</span>;
}

export function BadgeCloneHermes({ className }: { className?: string }) {
  return <span className={cn(base, VERMELHO, className)}>Possível clone</span>;
}

/** Saúde do container reportada pelo agente. */
export function BadgeSaudeHermes({ container, saude, className }: { container: string | null; saude: string | null; className?: string }) {
  if (!container) return <span className={cn(base, NEUTRO, className)}>sem estado</span>;
  if (container !== "rodando") return <span className={cn(base, container === "desconhecido" ? NEUTRO : VERMELHO, className)}>{container}</span>;
  if (saude === "saudavel") return <span className={cn(base, VERDE, className)}>rodando · saudável</span>;
  if (saude === "nao_saudavel") return <span className={cn(base, VERMELHO, className)}>rodando · não saudável</span>;
  if (saude === "iniciando") return <span className={cn(base, AMBAR, className)}>iniciando</span>;
  return <span className={cn(base, NEUTRO, className)}>rodando</span>;
}
