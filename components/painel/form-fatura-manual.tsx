"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { criarFaturaManual, type EstadoFaturaManual } from "@/app/painel/financeiro/actions";

export function FormFaturaManual({
  contratosDisponiveis,
}: {
  contratosDisponiveis: { id: string; rotulo: string }[];
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoFaturaManual, FormData>(
    criarFaturaManual,
    {}
  );
  const [historica, setHistorica] = React.useState(false);
  const [jaQuitada, setJaQuitada] = React.useState(false);

  const campo = (nome: keyof NonNullable<EstadoFaturaManual["erros"]>) =>
    estado.erros?.[nome] ? (
      <p role="alert" className="mt-1 text-xs text-red-300">
        {estado.erros[nome]}
      </p>
    ) : null;

  const estiloInput = "border-white/10 bg-white/5 text-white placeholder:text-white/35";

  return (
    <form action={dispatch} className="max-w-2xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="contratoId">Contrato *</Label>
          <Select id="contratoId" name="contratoId" required>
            <option value="">Selecione...</option>
            {contratosDisponiveis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </Select>
          {campo("contratoId")}
        </div>

        <div>
          <Label htmlFor="competencia">Competência (MM/AAAA) *</Label>
          <Input
            id="competencia"
            name="competencia"
            placeholder="03/2026"
            inputMode="numeric"
            required
            className={estiloInput}
          />
          {campo("competencia")}
        </div>

        <div>
          <Label htmlFor="vencimento">Vencimento *</Label>
          <Input id="vencimento" name="vencimento" type="date" required className={estiloInput} />
          {campo("vencimento")}
        </div>

        <div>
          <Label htmlFor="valor">Valor (R$) *</Label>
          <Input id="valor" name="valor" placeholder="1.500,00" required className={estiloInput} />
          {campo("valor")}
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-4">
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            name="historica"
            value="sim"
            checked={historica}
            onChange={(e) => setHistorica(e.target.checked)}
            className="h-4 w-4 accent-cyan-400"
          />
          Fatura histórica (só registro — nunca afeta licença nem gera aviso)
        </label>

        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            name="jaQuitada"
            value="sim"
            checked={jaQuitada}
            onChange={(e) => setJaQuitada(e.target.checked)}
            className="h-4 w-4 accent-cyan-400"
          />
          Já foi paga (lança o pagamento junto)
        </label>

        {jaQuitada ? (
          <div className="pt-1">
            <Label htmlFor="pagoEm">Data do pagamento *</Label>
            <Input id="pagoEm" name="pagoEm" type="date" className={`max-w-[200px] ${estiloInput}`} />
            {campo("pagoEm")}
          </div>
        ) : null}
      </div>

      <div>
        <Label htmlFor="notas">Notas</Label>
        <Textarea id="notas" name="notas" className={`min-h-[60px] ${estiloInput}`} />
      </div>

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
        {pendente ? "Lançando..." : "Lançar fatura"}
      </Button>
    </form>
  );
}
