"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  Radar,
  Users,
  Receipt,
  Server,
  Settings2,
  ScrollText,
  LogOut,
  Menu,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar } from "@/components/painel/ui";
import type { ItemNav } from "@/components/painel/sidebar";

const ICONES = {
  dashboard: LayoutDashboard,
  clientes: Users,
  prospeccao: Radar,
  leads: Inbox,
  financeiro: Receipt,
  servidores: Server,
  config: Settings2,
  auditoria: ScrollText,
} as const;

/**
 * Navegação mobile: barra fixa no topo + drawer lateral. O drawer usa os
 * mesmos rótulos da sidebar (nada de abreviação) e cresce sem limite —
 * itens novos entram sem repensar a navegação.
 */
export function DrawerMovel({
  itens,
  usuario,
  grupo,
  acaoSair,
}: {
  itens: ItemNav[];
  usuario: string;
  grupo: string;
  acaoSair: () => Promise<void>;
}) {
  const [aberto, setAberto] = React.useState(false);
  const pathname = usePathname();

  // fecha ao navegar
  React.useEffect(() => {
    setAberto(false);
  }, [pathname]);

  // trava o scroll do fundo e fecha no ESC enquanto aberto
  React.useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener("keydown", onKey);
    };
  }, [aberto]);

  return (
    <>
      {/* barra do topo */}
      <header className="rv-topbar-movel sticky top-0 z-30 flex items-center gap-3 border-b border-white/8 px-3 py-2.5 md:hidden">
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          aria-expanded={aberto}
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/70 transition-colors active:bg-white/10 active:text-white"
        >
          <Menu className="size-5" />
        </button>

        <Link href="/painel" className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#00E5FF] to-[#00FF8A] font-mono text-[11px] font-bold text-[#05070B]">
            RV
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold text-white">RVLand Devs</span>
            <span className="rv-eyebrow block">central de gestão</span>
          </span>
        </Link>

        <Avatar nome={usuario} className="size-9 shrink-0" />
      </header>

      {/* overlay */}
      <div
        onClick={() => setAberto(false)}
        aria-hidden
        className={cn(
          "fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity duration-200 md:hidden",
          aberto ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        className={cn(
          "rv-drawer fixed inset-y-0 left-0 z-50 flex w-[17.5rem] max-w-[85vw] flex-col md:hidden",
          "border-r border-white/10 bg-[#070A0F]",
          "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          aberto ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 pb-4 pt-5">
          <span className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#00E5FF] to-[#00FF8A] font-mono text-[13px] font-bold text-[#05070B]">
              RV
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-white">RVLand Devs</span>
              <span className="rv-eyebrow block">central de gestão</span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => setAberto(false)}
            aria-label="Fechar menu"
            className="grid size-9 place-items-center rounded-lg text-white/40 transition-colors active:bg-white/8 active:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {itens.map((item) => {
            const Icone = ICONES[item.icone];
            const ativo =
              item.href === "/painel" ? pathname === "/painel" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] transition-colors",
                  ativo ? "bg-white/[0.07] text-white" : "text-white/60 active:bg-white/[0.04]"
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full transition-opacity",
                    ativo
                      ? "bg-gradient-to-b from-[#00E5FF] to-[#00FF8A] opacity-100"
                      : "opacity-0"
                  )}
                />
                <Icone className={cn("size-[18px] shrink-0", ativo && "text-[#8AF0FF]")} />
                {item.rotulo}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/8 p-3">
          <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.04] p-3">
            <Avatar nome={usuario} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-medium text-white">{usuario}</span>
              <span className="rv-eyebrow block truncate">{grupo}</span>
            </span>
            <form action={acaoSair} className="shrink-0">
              <button
                type="submit"
                aria-label="Sair"
                className="grid size-9 place-items-center rounded-lg text-white/40 transition-colors active:bg-white/8 active:text-white"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
