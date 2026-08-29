"use client";

import * as React from "react";
import { useActionState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { Copiavel } from "@/components/painel/copiavel";
import type { EstadoToken } from "@/app/(app)/painel/servidores/actions";

export function RevelarToken({
  acao,
  siteUrl,
  jaPendente,
}: {
  acao: (estado: EstadoToken, formData: FormData) => Promise<EstadoToken>;
  siteUrl: string;
  /** true quando o servidor ainda não fez enroll (mostra ação primária). */
  jaPendente: boolean;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoToken, FormData>(acao, {});

  if (estado.token) {
    const comando = `curl -fsSL ${siteUrl}/api/agente/instalar | sudo bash -s -- --token=${estado.token} --servidor=${siteUrl}`;
    return (
      <div className="space-y-4">
        <Copiavel rotulo="token de enrollment" valor={estado.token} />
        <Copiavel rotulo="comando de instalação" valor={comando} />
        <p className="text-xs text-white/35">
          Vale 24h e é de uso único. Não será mostrado de novo — copie agora.
        </p>
      </div>
    );
  }

  return (
    <form action={dispatch} className="space-y-2">
      <Btn type="submit" variante={jaPendente ? "primario" : "secundario"} disabled={pendente}>
        {jaPendente ? <KeyRound className="size-4" /> : <RefreshCw className="size-4" />}
        {pendente
          ? "Gerando..."
          : jaPendente
            ? "Gerar token de instalação"
            : "Regenerar token (repareia)"}
      </Btn>
      {!jaPendente ? (
        <p className="text-xs text-white/35">
          Volta o servidor a pendente e invalida a instalação atual — use para reinstalar.
        </p>
      ) : null}
      {estado.erro ? (
        <p role="alert" className="text-xs text-red-300">
          {estado.erro}
        </p>
      ) : null}
    </form>
  );
}
