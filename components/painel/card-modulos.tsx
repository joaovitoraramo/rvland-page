"use client";

import { useActionState } from "react";
import { Boxes } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CamposModulos } from "@/components/painel/campos-modulos";
import type { EstadoAcao } from "@/app/(app)/painel/servidores/actions";
import type { ModulosServidor } from "@/lib/dominio/agente-modulos";

export function CardModulos({
  acao,
  modulos,
  podeEditar,
}: {
  acao: (estado: EstadoAcao, formData: FormData) => Promise<EstadoAcao>;
  modulos: ModulosServidor;
  podeEditar: boolean;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoAcao, FormData>(acao, {});
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Boxes className="size-4 text-[#8AF0FF]" />
          Módulos do agente
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={dispatch} className="space-y-4">
          <fieldset disabled={!podeEditar || pendente}>
            <CamposModulos valor={modulos} />
          </fieldset>
          <p className="text-xs text-white/40">
            Vão dentro da licença assinada e valem no próximo contato do agente (até 1 min). Com
            Licença desligada, o agente nunca para nem religa serviço por causa de licença.
          </p>
          {podeEditar ? (
            <Btn type="submit" variante="secundario" disabled={pendente}>
              {pendente ? "Salvando..." : "Salvar módulos"}
            </Btn>
          ) : null}
          {estado.ok ? <p className="text-xs text-[#7DFFC4]">{estado.ok}</p> : null}
          {estado.erro ? (
            <p role="alert" className="text-xs text-red-300">
              {estado.erro}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
