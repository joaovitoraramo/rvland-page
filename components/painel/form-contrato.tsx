"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { criarContrato, type EstadoFormContrato } from "@/app/painel/contratos/actions";

export function FormContrato({ clienteId }: { clienteId: string }) {
  const [estado, dispatch, pendente] = useActionState<EstadoFormContrato, FormData>(
    criarContrato,
    {}
  );
  const [tipo, setTipo] = React.useState<"recorrente" | "fechado">("recorrente");

  const campo = (nome: keyof NonNullable<EstadoFormContrato["erros"]>) =>
    estado.erros?.[nome] ? (
      <p role="alert" className="mt-1 text-xs text-red-300">
        {estado.erros[nome]}
      </p>
    ) : null;

  const estiloInput = "border-white/10 bg-white/5 text-white placeholder:text-white/35";

  return (
    <form action={dispatch} className="max-w-2xl space-y-4">
      <input type="hidden" name="clienteId" value={clienteId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="tipo">Tipo *</Label>
          <Select
            id="tipo"
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "recorrente" | "fechado")}
          >
            <option value="recorrente">Recorrente (mensalidade + licença)</option>
            <option value="fechado">Fechado (pagamento único, sem licença)</option>
          </Select>
        </div>

        <div>
          <Label htmlFor="titulo">Título *</Label>
          <Input id="titulo" name="titulo" placeholder="Ex: Plataforma Credit Recover" required className={estiloInput} />
          {campo("titulo")}
        </div>

        <div>
          <Label htmlFor="valor">{tipo === "recorrente" ? "Mensalidade (R$) *" : "Valor total (R$) *"}</Label>
          <Input id="valor" name="valor" placeholder="1.500,00" required className={estiloInput} />
          {campo("valor")}
        </div>

        <div>
          <Label htmlFor="inicio">Início *</Label>
          <Input id="inicio" name="inicio" type="date" required className={estiloInput} />
          {campo("inicio")}
        </div>

        {tipo === "recorrente" ? (
          <>
            <div>
              <Label htmlFor="diaVencimento">Dia de vencimento (1–28) *</Label>
              <Input
                id="diaVencimento"
                name="diaVencimento"
                type="number"
                min={1}
                max={28}
                defaultValue={15}
                required
                className={estiloInput}
              />
              {campo("diaVencimento")}
            </div>
            <div>
              <Label htmlFor="toleranciaDias">Tolerância após vencimento (dias)</Label>
              <Input
                id="toleranciaDias"
                name="toleranciaDias"
                type="number"
                min={0}
                max={60}
                defaultValue={4}
                className={estiloInput}
              />
              {campo("toleranciaDias")}
              <p className="mt-1 text-xs text-white/40">
                Sistema segue operando esse período após vencer; depois, bloqueio.
              </p>
            </div>
          </>
        ) : null}
      </div>

      <div>
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" name="descricao" className={`min-h-[80px] ${estiloInput}`} />
      </div>

      <p className="text-xs text-white/40">
        Modelo de cobrança por uso (R$/cliente ativo) chega em fase futura — contratos nascem
        como valor fixo.
      </p>

      {estado.erro ? (
        <p role="alert" className="text-sm text-red-300">
          {estado.erro}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pendente}
        className="rounded-xl bg-[rgba(0,229,255,0.18)] text-white hover:bg-[rgba(0,229,255,0.26)]"
      >
        {pendente ? "Criando..." : "Criar contrato"}
      </Button>
    </form>
  );
}
