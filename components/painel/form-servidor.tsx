"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Server } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { Label } from "@/components/ui/label";
import { SelectRico } from "@/components/painel/select-rico";
import { Copiavel } from "@/components/painel/copiavel";
import { criarServidor, type EstadoServidor } from "@/app/painel/servidores/actions";

export function FormServidor({
  clientes,
  clientePreset,
  siteUrl,
}: {
  clientes: { id: string; nome: string }[];
  clientePreset?: string;
  siteUrl: string;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoServidor, FormData>(criarServidor, {});
  const [clienteId, setClienteId] = React.useState(clientePreset ?? "");

  // Sucesso: o token só existe agora — mostra o comando de instalação
  if (estado.servidorId && estado.token) {
    const comando = `curl -fsSL ${siteUrl}/api/agente/instalar | sudo bash -s -- --token=${estado.token} --servidor=${siteUrl}`;
    return (
      <div className="max-w-2xl space-y-5">
        <div className="rounded-2xl border border-[rgba(0,255,138,0.2)] bg-[rgba(0,255,138,0.05)] p-6">
          <div className="text-sm font-medium text-[#7DFFC4]">Servidor cadastrado</div>
          <p className="mt-1 text-sm text-white/60">
            Cole o comando abaixo no SSH do servidor para instalar o agente. O token vale 24h e é
            de uso único — guarde agora, não será mostrado de novo.
          </p>
          <div className="mt-4 space-y-4">
            <Copiavel rotulo="token de enrollment" valor={estado.token} />
            <Copiavel rotulo="comando de instalação" valor={comando} />
          </div>
          <p className="mt-3 text-xs text-white/35">
            O instalador (/api/agente/instalar) é publicado na fase de release do agente. Até lá,
            o token já é válido para o enroll manual.
          </p>
        </div>
        <Btn asChild variante="primario">
          <Link href={`/painel/servidores/${estado.servidorId}`}>
            Abrir servidor <ArrowRight className="size-4" />
          </Link>
        </Btn>
      </div>
    );
  }

  return (
    <form action={dispatch} className="max-w-2xl">
      <input type="hidden" name="clienteId" value={clienteId} />
      <div className="rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.045] to-white/[0.02] p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="clienteId">Cliente *</Label>
            <SelectRico
              id="clienteId"
              icone={<Server />}
              placeholder="A quem pertence este servidor..."
              value={clienteId}
              onValueChange={setClienteId}
              invalido={!!estado.erros?.clienteId}
              opcoes={clientes.map((c) => ({ valor: c.id, titulo: c.nome }))}
            />
            {estado.erros?.clienteId ? (
              <p role="alert" className="mt-1.5 text-xs text-red-300">
                {estado.erros.clienteId}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="nome">Nome *</Label>
            <input id="nome" name="nome" placeholder="prod-01" required />
            {estado.erros?.nome ? (
              <p role="alert" className="mt-1.5 text-xs text-red-300">
                {estado.erros.nome}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="host">Host / IP (informativo)</Label>
            <input id="host" name="host" placeholder="10.0.0.9" className="font-mono" />
          </div>
          <div>
            <Label htmlFor="so">Sistema operacional</Label>
            <input id="so" name="so" placeholder="Debian 12" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="descricao">Descrição</Label>
            <input id="descricao" name="descricao" />
          </div>
        </div>
      </div>

      {estado.erro ? (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {estado.erro}
        </p>
      ) : null}

      <div className="mt-5">
        <Btn type="submit" variante="primario" disabled={pendente}>
          <Server className="size-4" />
          {pendente ? "Criando..." : "Cadastrar e gerar token"}
        </Btn>
      </div>
    </form>
  );
}
