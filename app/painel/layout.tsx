import type { Metadata } from "next";
import { AlertTriangle, FlaskConical } from "lucide-react";

import { exigirPerfil, pode } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { sair } from "@/app/login/actions";
import { Sidebar, type ItemNav } from "@/components/painel/sidebar";

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
  if (pode(perfil, "financeiro.ver")) {
    itens.push({ href: "/painel/financeiro", rotulo: "Financeiro", icone: "financeiro" });
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
    <div className="flex min-h-screen bg-[#05070b] text-white">
      <Sidebar
        itens={itens}
        usuario={perfil.nome}
        grupo={perfil.grupoNome}
        acaoSair={sair}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {config.modoPanico ? (
          <div className="flex items-center gap-2 border-b border-red-500/30 bg-red-500/15 px-6 py-2 text-sm text-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              <strong>Bloqueios suspensos</strong> — botão de pânico ativo. Nenhum cliente será
              bloqueado por atraso.
            </span>
          </div>
        ) : null}

        {config.modoSimulacao ? (
          <div className="flex items-center gap-2 border-b border-cyan-400/20 bg-cyan-400/10 px-6 py-2 text-sm text-cyan-200">
            <FlaskConical className="h-4 w-4 shrink-0" />
            <span>
              <strong>Modo simulação</strong> — bloqueios são apenas indicados, nada é executado.
            </span>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 px-6 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
