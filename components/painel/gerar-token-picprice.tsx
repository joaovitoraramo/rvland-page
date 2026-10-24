"use client";

import { useActionState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { Copiavel } from "@/components/painel/copiavel";
import type { EstadoTokenPicPrice } from "@/app/(app)/painel/picprice/actions";

/** Gera/troca o token do cliente e mostra o valor cru UMA vez. */
export function GerarTokenPicPrice({
  acao,
  clienteId,
  troca,
}: {
  acao: (estado: EstadoTokenPicPrice, formData: FormData) => Promise<EstadoTokenPicPrice>;
  clienteId: string;
  troca: boolean;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoTokenPicPrice, FormData>(acao, {});
  if (estado.token) {
    return (
      <div className="max-w-md space-y-1.5">
        <Copiavel rotulo="token do cliente" valor={estado.token} />
        <p className="text-xs text-white/40">Copie agora: não será mostrado de novo. Cole na Área Técnica do Hermes do cliente.</p>
      </div>
    );
  }
  return (
    <form action={dispatch} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="clienteId" value={clienteId} />
      {troca ? <input type="hidden" name="troca" value="1" /> : null}
      <Btn type="submit" tamanho="sm" variante={troca ? "secundario" : "primario"} disabled={pendente}>
        {troca ? <RefreshCw /> : <KeyRound />}
        {pendente ? "Gerando..." : troca ? "Trocar token" : "Gerar token"}
      </Btn>
      {estado.erro ? <span className="text-xs text-red-300">{estado.erro}</span> : null}
    </form>
  );
}
