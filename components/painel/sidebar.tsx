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

export type ItemNav = {
  href: string;
  rotulo: string;
  icone: "dashboard" | "clientes" | "financeiro" | "servidores" | "config" | "auditoria";
};

const ICONES = {
  dashboard: LayoutDashboard,
  clientes: Users,
  financeiro: Receipt,
  servidores: Server,
  config: Settings2,
  auditoria: ScrollText,
} as const;

export function Sidebar({
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
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/8 bg-black/30 backdrop-blur-xl md:flex">
      {/* Marca */}
      <Link href="/painel" className="flex items-center gap-3 px-5 pb-5 pt-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#00E5FF] to-[#00FF8A] font-mono text-[13px] font-bold text-[#05070B]">
          RV
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-wide text-white">
            RVLand Devs
          </span>
          <span className="rv-eyebrow block">central de gestão</span>
        </span>
      </Link>

      {/* Navegação */}
      <nav className="flex-1 space-y-0.5 px-3 pt-2">
        {itens.map((item) => {
          const Icone = ICONES[item.icone];
          const ativo =
            item.href === "/painel"
              ? pathname === "/painel"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors",
                ativo
                  ? "bg-white/[0.07] text-white"
                  : "text-white/55 hover:bg-white/[0.04] hover:text-white"
              )}
            >
              {/* trilho de ativo */}
              <span
                className={cn(
                  "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full transition-all",
                  ativo
                    ? "bg-gradient-to-b from-[#00E5FF] to-[#00FF8A] opacity-100"
                    : "opacity-0"
                )}
              />
              <Icone className={cn("size-4", ativo ? "text-[#8AF0FF]" : "")} />
              {item.rotulo}
            </Link>
          );
        })}
      </nav>

      {/* Usuário */}
      <div className="border-t border-white/8 p-3">
        <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.04] p-3">
          <Avatar nome={usuario} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-medium text-white">
              {usuario}
            </span>
            <span className="rv-eyebrow block truncate">{grupo}</span>
          </span>
          <form action={acaoSair} className="shrink-0">
            <button
              type="submit"
              title="Sair"
              aria-label="Sair"
              className="grid size-8 place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(0,229,255,0.3)]"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
