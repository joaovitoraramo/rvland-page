"use client";

import * as React from "react";
import { useActionState } from "react";
import { FileText, ReceiptText, Sparkles } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { Label } from "@/components/ui/label";
import { SelectRico } from "@/components/painel/select-rico";
import { InputCompetencia, InputDinheiro } from "@/components/painel/inputs-mascarados";
import { parseCompetenciaHumana } from "@/lib/dominio/tempo";
import { criarFaturaManual, type EstadoFaturaManual } from "@/app/(app)/painel/financeiro/actions";

export type ContratoParaFatura = {
  id: string;
  cliente: string;
  titulo: string;
  tipo: "recorrente" | "fechado";
  diaVencimento: number | null;
};

export function FormFaturaManual({
  contratosDisponiveis,
}: {
  contratosDisponiveis: ContratoParaFatura[];
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoFaturaManual, FormData>(
    criarFaturaManual,
    {}
  );
  const [historica, setHistorica] = React.useState(false);
  const [jaQuitada, setJaQuitada] = React.useState(false);

  // Fluxo guiado: contrato → competência → (vencimento sozinho) → valor.
  // Se o usuário tocar no vencimento manualmente, paramos de sobrescrever.
  const [contratoId, setContratoId] = React.useState("");
  const [competencia, setCompetencia] = React.useState("");
  const [vencimento, setVencimento] = React.useState("");
  const [vencimentoTocado, setVencimentoTocado] = React.useState(false);
  const [autofillAtivo, setAutofillAtivo] = React.useState(false);

  const competenciaRef = React.useRef<HTMLInputElement | null>(null);
  const valorRef = React.useRef<HTMLInputElement | null>(null);

  const tentarAutofill = React.useCallback(
    (comp: string, contrato: string, tocado: boolean): boolean => {
      if (tocado) return false;
      const iso = parseCompetenciaHumana(comp);
      const dia = contratosDisponiveis.find((c) => c.id === contrato)?.diaVencimento;
      if (iso && dia) {
        setVencimento(`${iso.slice(0, 7)}-${String(dia).padStart(2, "0")}`);
        setAutofillAtivo(true);
        return true;
      }
      return false;
    },
    [contratosDisponiveis]
  );

  const aoEscolherContrato = (id: string) => {
    setContratoId(id);
    tentarAutofill(competencia, id, vencimentoTocado);
  };

  // O Radix devolveria o foco ao trigger; redirecionamos para o próximo
  // passo do fluxo (competência, ou valor se a competência já está pronta).
  const aoFecharSelect = (e: Event) => {
    e.preventDefault();
    if (!parseCompetenciaHumana(competencia)) {
      competenciaRef.current?.focus();
    } else if (!valorRef.current?.value) {
      valorRef.current?.focus();
    }
  };

  const aoDigitarCompetencia = (v: string) => {
    setCompetencia(v);
    const preencheu = tentarAutofill(v, contratoId, vencimentoTocado);
    // competência completa + vencimento resolvido → pula direto pro valor
    const completa = !!parseCompetenciaHumana(v);
    const vencimentoResolvido = preencheu || vencimento !== "";
    if (completa && vencimentoResolvido && !valorRef.current?.value) {
      valorRef.current?.focus();
    }
  };

  const diaDoContrato = contratosDisponiveis.find((c) => c.id === contratoId)?.diaVencimento;

  const campo = (nome: keyof NonNullable<EstadoFaturaManual["erros"]>) =>
    estado.erros?.[nome] ? (
      <p role="alert" className="mt-1.5 text-xs text-red-300">
        {estado.erros[nome]}
      </p>
    ) : null;

  return (
    <form action={dispatch} className="max-w-2xl">
      <div className="rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.045] to-white/[0.02] p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="contratoId">Contrato *</Label>
            <SelectRico
              id="contratoId"
              name="contratoId"
              required
              icone={<FileText />}
              placeholder="Escolha o contrato..."
              value={contratoId}
              onValueChange={aoEscolherContrato}
              onCloseAutoFocus={aoFecharSelect}
              invalido={!!estado.erros?.contratoId}
              opcoes={contratosDisponiveis.map((c) => ({
                valor: c.id,
                titulo: c.cliente,
                detalhe: c.titulo,
                tag: c.tipo,
              }))}
            />
            {campo("contratoId")}
          </div>

          <div>
            <Label htmlFor="competencia">Competência *</Label>
            <InputCompetencia
              id="competencia"
              name="competencia"
              required
              ref={competenciaRef}
              aoMudar={aoDigitarCompetencia}
              aria-invalid={!!estado.erros?.competencia}
            />
            {campo("competencia")}
          </div>

          <div>
            <Label htmlFor="vencimento">Vencimento *</Label>
            <input
              id="vencimento"
              name="vencimento"
              type="date"
              required
              value={vencimento}
              onChange={(e) => {
                setVencimento(e.target.value);
                setVencimentoTocado(true);
                setAutofillAtivo(false);
              }}
              aria-invalid={!!estado.erros?.vencimento}
            />
            {autofillAtivo && diaDoContrato ? (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-[#8AF0FF]">
                <Sparkles className="size-3" />
                puxado do contrato — vence dia {diaDoContrato}
              </p>
            ) : null}
            {campo("vencimento")}
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="valor">Valor *</Label>
            <InputDinheiro
              id="valor"
              name="valor"
              required
              ref={valorRef}
              className="max-w-[240px]"
              aria-invalid={!!estado.erros?.valor}
            />
            {campo("valor")}
          </div>
        </div>

        <div className="mt-5 space-y-3 rounded-xl border border-white/8 bg-black/25 p-4">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-white/75">
            <input
              type="checkbox"
              name="historica"
              value="sim"
              checked={historica}
              onChange={(e) => setHistorica(e.target.checked)}
            />
            Fatura histórica — só registro, nunca afeta licença nem gera aviso
          </label>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-white/75">
            <input
              type="checkbox"
              name="jaQuitada"
              value="sim"
              checked={jaQuitada}
              onChange={(e) => setJaQuitada(e.target.checked)}
            />
            Já foi paga — lança o pagamento junto
          </label>

          {jaQuitada ? (
            <div className="pt-1">
              <Label htmlFor="pagoEm">Data do pagamento *</Label>
              <input
                id="pagoEm"
                name="pagoEm"
                type="date"
                className="max-w-[200px]"
                aria-invalid={!!estado.erros?.pagoEm}
              />
              {campo("pagoEm")}
            </div>
          ) : null}
        </div>

        <div className="mt-5">
          <Label htmlFor="notas">Notas</Label>
          <textarea id="notas" name="notas" className="min-h-[60px]" />
        </div>
      </div>

      {estado.erro ? (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {estado.erro}
        </p>
      ) : null}

      <div className="mt-5">
        <Btn type="submit" variante="primario" disabled={pendente}>
          {pendente ? "Lançando..." : "Lançar fatura"}
          {!pendente ? <ReceiptText className="size-4" /> : null}
        </Btn>
      </div>
    </form>
  );
}
