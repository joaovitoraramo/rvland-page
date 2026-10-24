"use client";

import * as React from "react";
import { Download, Monitor, Terminal } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { Copiavel } from "@/components/painel/copiavel";
import { comandoInstalacao, type ModulosServidor } from "@/lib/dominio/agente-modulos";
import { arquivoCmdWindows, comandoInstalacaoWindows, NOME_ARQUIVO_CMD } from "@/lib/dominio/instalador-windows";
import type { SistemaServidor } from "@/lib/dominio/servidor-so";
import { cn } from "@/lib/utils";

/**
 * Instalação do agente com o token recém-gerado: abas Linux (curl no SSH) e
 * Windows (comando para o Prompt de Comando como administrador, ou o .cmd que
 * se eleva sozinho). O .cmd é montado aqui no navegador — o token nunca passa
 * por URL nem fica no servidor.
 */
export function InstalacaoAgente({
  siteUrl,
  token,
  modulos,
  soInicial = "linux",
}: {
  siteUrl: string;
  token: string;
  modulos: ModulosServidor;
  soInicial?: SistemaServidor;
}) {
  const [so, setSo] = React.useState<SistemaServidor>(soInicial);
  const params = { siteUrl, token, modulos };

  const baixarCmd = () => {
    const blob = new Blob([arquivoCmdWindows(params)], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = NOME_ARQUIVO_CMD;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const aba = (valor: SistemaServidor, rotulo: string, Icone: typeof Terminal) => (
    <button
      type="button"
      role="tab"
      aria-selected={so === valor}
      onClick={() => setSo(valor)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        so === valor ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
      )}
    >
      <Icone className="size-3.5" />
      {rotulo}
    </button>
  );

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Sistema do servidor" className="inline-flex gap-1 rounded-full border border-white/10 bg-black/30 p-1">
        {aba("linux", "Linux", Terminal)}
        {aba("windows", "Windows", Monitor)}
      </div>

      {so === "linux" ? (
        <div className="space-y-2">
          <Copiavel rotulo="comando de instalação (SSH, como root)" valor={comandoInstalacao(params)} />
          <p className="text-xs text-white/40">
            Cole no SSH do servidor. Ele baixa o agente, registra o servidor e sobe o serviço systemd.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <Copiavel
            rotulo="comando de instalação (Prompt de Comando como administrador)"
            valor={comandoInstalacaoWindows(params)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Btn type="button" tamanho="sm" onClick={baixarCmd}>
              <Download className="size-3.5" />
              Baixar instalador (.cmd)
            </Btn>
            <span className="text-xs text-white/40">ou: baixe, dê dois cliques e confirme o pedido de administrador.</span>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-white/45">
            <li>Abra o Prompt de Comando como administrador (ou use o .cmd, que pede sozinho).</li>
            <li>Cole o comando. Ele baixa o agente, confere o SHA-256, registra o servidor e cria o serviço rvland-agent.</li>
            <li>No fim aparece o status do agente. O serviço inicia com o Windows e reinicia sozinho em falha.</li>
          </ol>
        </div>
      )}
    </div>
  );
}
