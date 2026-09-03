import type { Metadata } from "next";
import { AlertTriangle, FlaskConical } from "lucide-react";

import { exigirPerfil, pode } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { sair } from "@/app/(app)/login/actions";
import { Sidebar, type ItemNav } from "@/components/painel/sidebar";
import { DrawerMovel } from "@/components/painel/drawer-movel";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s | Painel RVLand" },
  robots: { index: false, follow: false },
};

// Sessão + dados por request, sempre dinâmico
export const dynamic = "force-dynamic";

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const perfil = await exigirPerfil();
  const config = await getConfig();

  const itens: ItemNav[] = [
    { href: "/painel", rotulo: "Dashboard", icone: "dashboard" },
  ];
  if (pode(perfil, "clientes.ver")) {
    itens.push({ href: "/painel/clientes", rotulo: "Clientes", icone: "clientes" });
  }
  if (pode(perfil, "prospeccao.ver")) {
    itens.push({ href: "/painel/prospeccao", rotulo: "Prospecção", icone: "prospeccao" });
  }
  if (pode(perfil, "leads.ver")) {
    itens.push({ href: "/painel/leads", rotulo: "Leads", icone: "leads" });
  }
  if (pode(perfil, "financeiro.ver")) {
    itens.push({ href: "/painel/financeiro", rotulo: "Financeiro", icone: "financeiro" });
  }
  if (pode(perfil, "servidores.ver")) {
    itens.push({ href: "/painel/servidores", rotulo: "Servidores", icone: "servidores" });
  }
  if (pode(perfil, "plataforma.auditoria")) {
    itens.push({ href: "/painel/auditoria", rotulo: "Auditoria", icone: "auditoria" });
  }
  if (
    pode(perfil, "plataforma.usuarios") ||
    pode(perfil, "plataforma.grupos") ||
    pode(perfil, "plataforma.panico") ||
    pode(perfil, "plataforma.simulacao")
  ) {
    itens.push({ href: "/painel/config", rotulo: "Configurações", icone: "config" });
  }

  return (
    <div className="painel flex min-h-screen bg-[#05070b] text-white">
      {/* ambiente: mesma atmosfera da landing, bem mais quieta */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1000px_circle_at_15%_-10%,rgba(0,229,255,0.07),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(800px_circle_at_90%_110%,rgba(0,255,138,0.05),transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.05] [background-image:radial-gradient(rgba(255,255,255,0.4)_1px,transparent_1px)] [background-size:24px_24px]" />
      </div>

      <Sidebar
        itens={itens}
        usuario={perfil.nome}
        grupo={perfil.grupoNome}
        acaoSair={sair}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <DrawerMovel itens={itens} usuario={perfil.nome} grupo={perfil.grupoNome} acaoSair={sair} />
        {config.modoPanico ? (
          <div className="rv-banner flex items-center gap-2.5 border-b border-red-500/25 bg-red-500/10 px-6 py-2.5 text-sm text-red-200 backdrop-blur-sm">
            <span className="grid size-6 shrink-0 place-items-center rounded-md border border-red-500/30 bg-red-500/15">
              <AlertTriangle className="size-3.5" />
            </span>
            <span>
              <strong className="font-semibold">Bloqueios suspensos</strong> — botão de pânico
              ativo. Nenhum cliente será bloqueado por atraso.
            </span>
          </div>
        ) : null}

        {config.modoSimulacao ? (
          <div className="rv-banner flex items-center gap-2.5 border-b border-[rgba(0,229,255,0.15)] bg-[rgba(0,229,255,0.06)] px-6 py-2.5 text-sm text-[#8AF0FF] backdrop-blur-sm">
            <span className="grid size-6 shrink-0 place-items-center rounded-md border border-[rgba(0,229,255,0.25)] bg-[rgba(0,229,255,0.1)]">
              <FlaskConical className="size-3.5" />
            </span>
            <span>
              <strong className="font-semibold">Modo simulação</strong> — bloqueios são apenas
              indicados, nada é executado.
            </span>
          </div>
        ) : null}

        {/* mobile: pb-28 dá respiro para a tab bar fixa; safe-areas no CSS */}
        <main className="min-w-0 flex-1 px-4 pb-10 pt-5 md:px-10 md:py-8">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
