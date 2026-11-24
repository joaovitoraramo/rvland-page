import Link from "next/link";

import { cn } from "@/lib/utils";

const ABAS = [
  { chave: "instalacoes", rotulo: "Instalações", href: "/painel/hermes" },
  { chave: "chaves", rotulo: "Chaves de instalação", href: "/painel/hermes/chaves" },
] as const;

/** Navegação entre as telas do Hermes (links, sem estado). */
export function AbasHermes({ ativa }: { ativa: (typeof ABAS)[number]["chave"] }) {
  return (
    <nav aria-label="Seções do Hermes" className="rv-entrar mb-5 flex flex-wrap gap-1.5">
      {ABAS.map((a) => (
        <Link
          key={a.chave}
          href={a.href}
          aria-current={a.chave === ativa ? "page" : undefined}
          className={cn(
            "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors",
            a.chave === ativa
              ? "border-[rgba(0,229,255,0.4)] bg-[rgba(0,229,255,0.1)] text-[#8AF0FF]"
              : "border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white"
          )}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
