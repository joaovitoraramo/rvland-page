"use client";

import * as React from "react";
import { useActionState } from "react";
import { FilePlus2 } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { Label } from "@/components/ui/label";
import { InputDinheiro } from "@/components/painel/inputs-mascarados";
import { criarContrato, type EstadoFormContrato } from "@/app/painel/contratos/actions";

export function FormContrato({ clienteId }: { clienteId: string }) {
  const [estado, dispatch, pendente] = useActionState<EstadoFormContrato, FormData>(
    criarContrato,
    {}
  );
  const [tipo, setTipo] = React.useState<"recorrente" | "fechado">("recorrente");

  const campo = (nome: keyof NonNullable<EstadoFormContrato["erros"]>) =>
    estado.erros?.[nome] ? (
      <p role="alert" className="mt-1.5 text-xs text-red-300">
        {estado.erros[nome]}
      </p>
    ) : null;

  return (
    <form action={dispatch} className="max-w-2xl">
      <input type="hidden" name="clienteId" value={clienteId} />

      <div className="rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.045] to-white/[0.02] p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="tipo">Tipo *</Label>
            <select
              id="tipo"
              name="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "recorrente" | "fechado")}
            >
              <option value="recorrente">Recorrente — mensalidade + licença</option>
              <option value="fechado">Fechado — pagamento único, sem licença</option>
            </select>
          </div>

          <div>
            <Label htmlFor="titulo">Título *</Label>
            <input
              id="titulo"
              name="titulo"
              placeholder="Ex: Plataforma Credit Recover"
              required
              aria-invalid={!!estado.erros?.titulo}
            />
            {campo("titulo")}
          </div>

          <div>
            <Label htmlFor="valor">
              {tipo === "recorrente" ? "Mensalidade *" : "Valor total *"}
            </Label>
            <InputDinheiro id="valor" name="valor" required aria-invalid={!!estado.erros?.valor} />
            {campo("valor")}
          </div>

          <div>
            <Label htmlFor="inicio">Início *</Label>
            <input id="inicio" name="inicio" type="date" required aria-invalid={!!estado.erros?.inicio} />
            {campo("inicio")}
          </div>

          {tipo === "recorrente" ? (
            <>
              <div>
                <Label htmlFor="diaVencimento">Dia de vencimento (1–28) *</Label>
                <input
                  id="diaVencimento"
                  name="diaVencimento"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={28}
                  defaultValue={15}
                  required
                  aria-invalid={!!estado.erros?.diaVencimento}
                />
                {campo("diaVencimento")}
              </div>
              <div>
                <Label htmlFor="toleranciaDias">Tolerância após vencer (dias)</Label>
                <input
                  id="toleranciaDias"
                  name="toleranciaDias"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={60}
                  defaultValue={4}
                  aria-invalid={!!estado.erros?.toleranciaDias}
                />
                {campo("toleranciaDias")}
                <p className="mt-1.5 text-xs text-white/35">
                  O sistema opera esse período após vencer; depois, bloqueio.
                </p>
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-5">
          <Label htmlFor="descricao">Descrição</Label>
          <textarea id="descricao" name="descricao" className="min-h-[80px]" />
        </div>

        <p className="mt-4 border-t border-white/8 pt-4 text-xs text-white/35">
          Cobrança por uso (R$/cliente ativo) chega em fase futura — contratos nascem com valor
          fixo.
        </p>
      </div>

      {estado.erro ? (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {estado.erro}
        </p>
      ) : null}

      <div className="mt-5">
        <Btn type="submit" variante="primario" disabled={pendente}>
          {pendente ? "Criando..." : "Criar contrato"}
          {!pendente ? <FilePlus2 className="size-4" /> : null}
        </Btn>
      </div>
    </form>
  );
}
