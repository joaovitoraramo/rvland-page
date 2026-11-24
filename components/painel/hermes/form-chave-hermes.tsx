"use client";

import * as React from "react";
import { useActionState } from "react";
import { KeyRound, Plus } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { Copiavel } from "@/components/painel/copiavel";
import { SelectRico } from "@/components/painel/select-rico";
import { Label } from "@/components/ui/label";
import { formatarDataHoraBR } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { EstadoChaveHermes } from "@/app/(app)/painel/hermes/actions";

export type ClienteChave = { id: string; nome: string; cnpj: string | null; cnpjValido: boolean };

const TIPOS = [
  { v: "instalacao", r: "Instalação nova", d: "Cliente sem Hermes. Vale 12 horas." },
  { v: "adocao", r: "Adoção", d: "Servidor que já tem o agente RV. Vale 24 horas." },
] as const;

const CANAIS = [
  { v: "stable", r: "stable" },
  { v: "preview", r: "preview" },
] as const;

function Segmentos<T extends string>({
  rotulo,
  opcoes,
  valor,
  onChange,
}: {
  rotulo: string;
  opcoes: readonly { v: T; r: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/30 p-0.5">
      {opcoes.map((o) => {
        const ativo = valor === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(o.v)}
            className={cn(
              "inline-flex h-9 items-center rounded-[10px] px-3.5 text-sm font-medium transition-colors",
              ativo ? "bg-[rgba(0,229,255,0.12)] text-[#8AF0FF]" : "text-white/55 hover:text-white"
            )}
          >
            {o.r}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Gera uma chave `hmk_`. O valor em claro existe só na resposta desta ação: aparece uma vez,
 * com botão de copiar, e some ao gerar outra ou sair da tela (o banco guarda só o hash).
 */
export function FormChaveHermes({
  clientes,
  acao,
}: {
  clientes: ClienteChave[];
  acao: (estado: EstadoChaveHermes, formData: FormData) => Promise<EstadoChaveHermes>;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoChaveHermes, FormData>(acao, {});
  const [tipo, setTipo] = React.useState<(typeof TIPOS)[number]["v"]>("instalacao");
  const [canal, setCanal] = React.useState<(typeof CANAIS)[number]["v"]>("stable");
  const [clienteId, setClienteId] = React.useState("");
  const [dispensada, setDispensada] = React.useState<string | null>(null);

  const escolhido = clientes.find((c) => c.id === clienteId);
  const semCnpj = escolhido ? !escolhido.cnpjValido : false;
  const mostrarChave = estado.chave && dispensada !== estado.chave;

  if (mostrarChave && estado.chave) {
    return (
      <div className="rounded-2xl border border-[rgba(0,255,138,0.2)] bg-[rgba(0,255,138,0.05)] p-5 md:p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-[#7DFFC4]">
          <KeyRound className="size-4" /> Chave de {estado.tipo === "adocao" ? "adoção" : "instalação"} gerada para {estado.clienteNome}
        </div>
        <div className="mt-4 max-w-2xl">
          <Copiavel rotulo="chave — copie agora" valor={estado.chave} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-white/55">
          Esta é a única vez que a chave aparece: o painel guarda só o hash. Vale até{" "}
          <strong className="text-white/80">{estado.expiraEm ? formatarDataHoraBR(new Date(estado.expiraEm)) : "—"}</strong>, é de uso único e presa à raiz do CNPJ do cliente.
          Perdeu? Revogue e gere outra.
        </p>
        <div className="mt-4">
          <Btn type="button" tamanho="sm" onClick={() => setDispensada(estado.chave ?? null)}>
            <Plus /> Gerar outra chave
          </Btn>
        </div>
      </div>
    );
  }

  const campoDesc = TIPOS.find((t) => t.v === tipo)?.d;

  return (
    <form action={dispatch} className="rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.045] to-white/[0.02] p-5 md:p-6">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="canal" value={canal} />
      <input type="hidden" name="clienteId" value={clienteId} />
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <Label>Tipo da chave</Label>
          <Segmentos rotulo="Tipo da chave" opcoes={TIPOS} valor={tipo} onChange={setTipo} />
          <p className="mt-1.5 text-xs text-white/40">{campoDesc}</p>
        </div>
        <div>
          <Label>Canal inicial</Label>
          <Segmentos rotulo="Canal inicial" opcoes={CANAIS} valor={canal} onChange={setCanal} />
          <p className="mt-1.5 text-xs text-white/40">stable é o padrão; preview recebe versões em teste.</p>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="cliente-chave">Cliente</Label>
          <SelectRico
            id="cliente-chave"
            icone={<KeyRound />}
            placeholder="Para qual cliente é a chave..."
            value={clienteId}
            onValueChange={setClienteId}
            opcoes={clientes.map((c) => ({
              valor: c.id,
              titulo: c.nome,
              detalhe: c.cnpj ?? "sem CNPJ",
              tag: c.cnpjValido ? undefined : "sem CNPJ válido",
            }))}
          />
          {semCnpj ? (
            <p role="alert" className="mt-1.5 text-xs text-[#FFD58A]">
              Este cliente não tem CNPJ válido cadastrado: a chave fica presa à raiz do CNPJ, então o painel recusa. Corrija o cadastro do cliente.
            </p>
          ) : null}
        </div>
      </div>

      {estado.erro ? (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {estado.erro}
        </p>
      ) : null}

      <div className="mt-5">
        <Btn type="submit" variante="primario" disabled={pendente || !clienteId || semCnpj}>
          <KeyRound /> {pendente ? "Gerando..." : "Gerar chave"}
        </Btn>
      </div>
    </form>
  );
}
