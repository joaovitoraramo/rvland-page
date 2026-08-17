"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Receipt,
  Settings2,
  ScrollText,
  LogOut,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type ItemNav = {
  href: string;
  rotulo: string;
  icone: "dashboard" | "clientes" | "financeiro" | "config" | "auditoria";
};

const ICONES = {
  dashboard: LayoutDashboard,
  clientes: Users,
  financeiro: Receipt,
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
    <aside className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-black/20">
      <Link href="/painel" className="px-5 py-5 leading-tight">
        <div className="text-sm font-semibold tracking-wide text-white">RVLand Devs</div>
        <div className="text-xs text-white/50">Central de gestão</div>
      </Link>

      <nav className="flex-1 space-y-1 px-3">
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
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                ativo
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icone className="h-4 w-4" />
              {item.rotulo}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="min-w-0">
          <div className="truncate text-sm text-white/85">{usuario}</div>
          <div className="text-xs text-white/45">{grupo}</div>
        </div>
        <form action={acaoSair} className="mt-3">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-white/55 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}
