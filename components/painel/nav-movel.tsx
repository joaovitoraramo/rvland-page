"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Receipt,
  Server,
  Settings2,
  ScrollText,
  LogOut,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar } from "@/components/painel/ui";
import type { ItemNav } from "@/components/painel/sidebar";

const ICONES = {
  dashboard: LayoutDashboard,
  clientes: Users,
  financeiro: Receipt,
  servidores: Server,
  config: Settings2,
  auditoria: ScrollText,
} as const;

// Labels curtos para caber na barra (o desktop mantém os longos)
const CURTOS: Record<ItemNav["icone"], string> = {
  dashboard: "Início",
  clientes: "Clientes",
  financeiro: "Finanças",
  servidores: "Parque",
  config: "Config",
  auditoria: "Auditoria",
};

/**
 * Navegação mobile (md some): top bar com marca/usuário e bottom tab bar —
 * a sidebar rotacionada, trilho gradiente no item ativo. A barra se esconde
 * quando o teclado abre (visualViewport encolhe) para não cobrir inputs.
 */
export function NavMovel({
  itens,
  usuario,
  acaoSair,
}: {
  itens: ItemNav[];
  usuario: string;
  acaoSair: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [tecladoAberto, setTecladoAberto] = React.useState(false);

  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      // teclado virtual encolhe o viewport visual em centenas de px
      setTecladoAberto(window.innerHeight - vv.height > 150);
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  return (
    <>
      {/* top bar */}
      <header className="rv-topbar-movel sticky top-0 z-40 flex items-center justify-between border-b border-white/8 px-4 py-2.5 md:hidden">
        <Link href="/painel" className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-[#00E5FF] to-[#00FF8A] font-mono text-[11px] font-bold text-[#05070B]">
            RV
          </span>
          <span className="rv-eyebrow">central de gestão</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <Avatar nome={usuario} className="size-8 text-[10px]" />
          <form action={acaoSair}>
            <button
              type="submit"
              title="Sair"
              aria-label="Sair"
              className="grid size-9 place-items-center rounded-lg text-white/40 transition-colors active:bg-white/8 active:text-white"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </header>

      {/* bottom tab bar */}
      <nav
        aria-label="Navegação principal"
        data-oculta={tecladoAberto}
        className="rv-tabbar fixed inset-x-0 bottom-0 z-40 md:hidden"
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}
        >
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
                  "relative flex min-w-0 flex-col items-center gap-1 pb-2 pt-2.5 transition-colors",
                  ativo ? "text-white" : "text-white/40 active:text-white/70"
                )}
              >
                {/* trilho de ativo: a sidebar deitada */}
                <span
                  className={cn(
                    "absolute inset-x-3 top-0 h-[2.5px] rounded-full transition-opacity",
                    ativo ? "bg-gradient-to-r from-[#00E5FF] to-[#00FF8A] opacity-100" : "opacity-0"
                  )}
                />
                <Icone className={cn("size-5", ativo && "text-[#8AF0FF]")} />
                <span className="max-w-full truncate px-1 font-mono text-[9px] uppercase tracking-[0.08em]">
                  {CURTOS[item.icone]}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
