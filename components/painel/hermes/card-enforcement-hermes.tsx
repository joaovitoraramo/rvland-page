"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check, FlaskConical, Lock, ShieldAlert, ShieldCheck, X } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { cn } from "@/lib/utils";
import { formatarDataHoraBR } from "@/lib/formato";
import { confirmacaoValerConfere, FRASE_VALER } from "@/lib/hermes/painel";
import type { EstadoAcaoHermes } from "@/app/(app)/painel/hermes/actions";

type Acao = (estado: EstadoAcaoHermes, formData: FormData) => Promise<EstadoAcaoHermes>;

/**
 * Modo global do Hermes (hermes_enforcement). Simulação = nunca bloqueia, só registra.
 * "Passar a valer" exige a frase digitada e a prova de chave real (o servidor confere de novo);
 * voltar à simulação é sempre possível, com um clique de confirmação.
 */
export function CardEnforcementHermes({
  ativo,
  ligadoEm,
  ligadoPor,
  motivoAtual,
  pode,
  motivoBloqueio,
  comProva,
  total,
  bloqueariam,
  podeAlterar,
  acao,
}: {
  ativo: boolean;
  ligadoEm: string | null;
  ligadoPor: string | null;
  motivoAtual: string | null;
  /** O servidor tem prova de chave real em toda instalação ativa. */
  pode: boolean;
  motivoBloqueio: string | null;
  comProva: number;
  total: number;
  bloqueariam: number;
  podeAlterar: boolean;
  acao: Acao;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoAcaoHermes, FormData>(acao, {});
  const [aberto, setAberto] = React.useState(false);
  const [frase, setFrase] = React.useState("");
  const [motivo, setMotivo] = React.useState("");
  const [confirmaVoltar, setConfirmaVoltar] = React.useState(false);
  const fraseOk = confirmacaoValerConfere(frase);

  return (
    <section
      aria-labelledby="titulo-enforcement"
      className={cn(
        "rounded-2xl border px-4 py-4 md:px-5",
        ativo ? "border-rose-400/25 bg-rose-400/[0.05]" : "border-white/8 bg-white/[0.02]"
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl border [&_svg]:size-4",
              ativo ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "border-[rgba(0,229,255,0.25)] bg-[rgba(0,229,255,0.08)] text-[#8AF0FF]"
            )}
          >
            {ativo ? <ShieldAlert /> : <FlaskConical />}
          </span>
          <div className="min-w-0">
            <h2 id="titulo-enforcement" className="text-sm font-semibold text-white">
              {ativo ? "Hermes valendo: licença bloqueante bloqueia de verdade" : "Hermes em simulação: nada é bloqueado"}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-white/50">
              {ativo
                ? `Ligado${ligadoPor ? ` por ${ligadoPor}` : ""}${ligadoEm ? ` em ${formatarDataHoraBR(new Date(ligadoEm))}` : ""}${motivoAtual ? ` — ${motivoAtual}` : ""}.`
                : "O agente só registra o que bloquearia. O modo global do Credit e do Pic Price não interfere aqui."}
            </p>
            <p className="rv-num mt-1.5 text-[11px] text-white/40">
              prova de chave real: {comProva} de {total} instalação(ões) ativa(s)
            </p>
          </div>
        </div>

        {podeAlterar ? (
          <div className="flex shrink-0 flex-col gap-2 md:items-end">
            {ativo ? (
              confirmaVoltar ? (
                <form action={dispatch} className="flex items-center gap-1.5">
                  <input type="hidden" name="alvo" value="simulacao" />
                  <Btn type="submit" tamanho="sm" variante="primario" disabled={pendente}>
                    <Check /> {pendente ? "Voltando..." : "Confirmar: voltar à simulação"}
                  </Btn>
                  <Btn type="button" tamanho="sm" variante="fantasma" onClick={() => setConfirmaVoltar(false)} aria-label="Cancelar">
                    <X />
                  </Btn>
                </form>
              ) : (
                <Btn type="button" tamanho="sm" variante="secundario" onClick={() => setConfirmaVoltar(true)}>
                  <FlaskConical /> Voltar para simulação
                </Btn>
              )
            ) : (
              <Btn
                type="button"
                tamanho="sm"
                variante={pode ? "perigo" : "secundario"}
                disabled={!pode}
                aria-describedby={!pode ? "motivo-bloqueio-valer" : undefined}
                onClick={() => setAberto((v) => !v)}
              >
                {pode ? <ShieldCheck /> : <Lock />} Passar a valer
              </Btn>
            )}
          </div>
        ) : null}
      </div>

      {!ativo && !pode ? (
        <p id="motivo-bloqueio-valer" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2.5 text-xs leading-relaxed text-[#FFD58A]">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong className="font-semibold">Botão bloqueado.</strong> {motivoBloqueio}
          </span>
        </p>
      ) : null}

      {!ativo && pode && aberto && podeAlterar ? (
        <form action={dispatch} className="mt-4 grid gap-3 border-t border-white/8 pt-4">
          <input type="hidden" name="alvo" value="valendo" />
          <p className="rounded-xl border border-rose-400/25 bg-rose-400/[0.07] px-3 py-2.5 text-xs leading-relaxed text-rose-100">
            {bloqueariam > 0
              ? `${bloqueariam} instalação(ões) ativa(s) já estão com licença bloqueante e serão bloqueadas no próximo contato do agente.`
              : "Nenhuma instalação ativa está com licença bloqueante agora; quem vencer ou for bloqueado a partir de agora passa a ser bloqueado."}{" "}
            Voltar para simulação é sempre possível.
          </p>
          <label className="grid gap-1 text-xs text-white/55">
            Motivo (opcional)
            <input
              name="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value.slice(0, 200))}
              placeholder="Ex.: frota atualizada com a chave real"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-[rgba(0,229,255,0.45)] focus:ring-[3px] focus:ring-[rgba(0,229,255,0.15)]"
            />
          </label>
          <label className="grid gap-1 text-xs text-white/55">
            <span>
              Digite <strong className="rv-num text-white/85">{FRASE_VALER}</strong> para confirmar
            </span>
            <input
              name="confirmacao"
              value={frase}
              onChange={(e) => setFrase(e.target.value)}
              placeholder={FRASE_VALER}
              autoComplete="off"
              spellCheck={false}
              className="rv-num h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm uppercase text-white placeholder:text-white/25 outline-none transition-colors focus:border-[rgba(255,93,93,0.5)] focus:ring-[3px] focus:ring-[rgba(255,93,93,0.15)] md:max-w-xs"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Btn type="submit" variante="perigo" disabled={!fraseOk || pendente}>
              <ShieldAlert /> {pendente ? "Ligando..." : "Passar a valer agora"}
            </Btn>
            <Btn
              type="button"
              variante="fantasma"
              onClick={() => {
                setAberto(false);
                setFrase("");
              }}
            >
              Cancelar
            </Btn>
          </div>
        </form>
      ) : null}

      {estado.erro ? (
        <p role="alert" className="mt-3 text-xs text-red-300">
          {estado.erro}
        </p>
      ) : null}
      {estado.ok ? (
        <p role="status" className="mt-3 text-xs text-emerald-300">
          {estado.ok}
        </p>
      ) : null}
    </section>
  );
}
