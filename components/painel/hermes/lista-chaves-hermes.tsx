"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Ban, Check, KeyRound, X } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { formatarDataHoraBR } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { LinhaChaveListada } from "@/lib/servicos/hermes-painel";
import type { EstadoAcaoHermes } from "@/app/(app)/painel/hermes/actions";
import { BadgeCanalHermes, BadgeChaveHermes } from "./badges-hermes";

const FILTROS = [
  { chave: "ativa", rotulo: "Abertas" },
  { chave: "usada", rotulo: "Usadas" },
  { chave: "expirada", rotulo: "Expiradas" },
  { chave: "revogada", rotulo: "Revogadas" },
  { chave: "todas", rotulo: "Todas" },
] as const;
type Filtro = (typeof FILTROS)[number]["chave"];

export function ListaChavesHermes({
  chaves,
  podeRevogar,
  acaoRevogar,
}: {
  chaves: LinhaChaveListada[];
  podeRevogar: boolean;
  acaoRevogar: (estado: EstadoAcaoHermes, formData: FormData) => Promise<EstadoAcaoHermes>;
}) {
  const [filtro, setFiltro] = React.useState<Filtro>("ativa");
  const contagem = (f: Filtro) => (f === "todas" ? chaves.length : chaves.filter((c) => c.situacao === f).length);
  const visiveis = filtro === "todas" ? chaves : chaves.filter((c) => c.situacao === filtro);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar chaves">
        {FILTROS.map((f) => {
          const ativo = filtro === f.chave;
          return (
            <button
              key={f.chave}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => setFiltro(f.chave)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                ativo
                  ? "border-[rgba(0,229,255,0.4)] bg-[rgba(0,229,255,0.1)] text-[#8AF0FF]"
                  : "border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white"
              )}
            >
              {f.rotulo}
              <span className={cn("rv-num text-[11px]", ativo ? "text-[#8AF0FF]/80" : "text-white/30")}>{contagem(f.chave)}</span>
            </button>
          );
        })}
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
          <p className="text-sm text-white/70">{filtro === "ativa" ? "Nenhuma chave aberta." : "Nenhuma chave nesse filtro."}</p>
          <p className="mt-1 text-xs text-white/40">As chaves aparecem aqui só pelo prefixo; o valor completo nunca é guardado.</p>
        </div>
      ) : (
        <ul className="grid gap-2.5">
          {visiveis.map((c) => (
            <LinhaChave key={c.id} c={c} podeRevogar={podeRevogar} acao={acaoRevogar} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LinhaChave({
  c,
  podeRevogar,
  acao,
}: {
  c: LinhaChaveListada;
  podeRevogar: boolean;
  acao: (estado: EstadoAcaoHermes, formData: FormData) => Promise<EstadoAcaoHermes>;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoAcaoHermes, FormData>(acao, {});
  const [confirmar, setConfirmar] = React.useState(false);
  const quando =
    c.situacao === "usada" && c.usadaEm
      ? `usada em ${formatarDataHoraBR(new Date(c.usadaEm))}`
      : c.situacao === "revogada" && c.revogadaEm
        ? `revogada em ${formatarDataHoraBR(new Date(c.revogadaEm))}`
        : c.situacao === "expirada"
          ? `expirou em ${formatarDataHoraBR(new Date(c.expiraEm))}`
          : `vale até ${formatarDataHoraBR(new Date(c.expiraEm))}`;

  return (
    <li className="rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.045] to-white/[0.02] px-4 py-3.5 md:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rv-num inline-flex items-center gap-1.5 text-sm font-semibold text-white">
              <KeyRound className="size-3.5 text-white/35" />
              {c.prefixo}…
            </span>
            <BadgeChaveHermes situacao={c.situacao} />
            <span className="rv-eyebrow rounded-full border border-white/12 px-2 py-0.5">{c.tipo === "adocao" ? "adoção" : "instalação"}</span>
            <BadgeCanalHermes canal={c.canalInicial} />
          </div>
          <div className="rv-num mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/45">
            <span>{c.clienteNome}</span>
            <span>{quando}</span>
            <span>emitida por {c.criadoPor}</span>
            {c.instalacaoId ? (
              <Link href={`/painel/hermes/${c.instalacaoId}`} className="text-[#8AF0FF] hover:underline">
                ver instalação
              </Link>
            ) : null}
          </div>
        </div>

        {podeRevogar && c.situacao === "ativa" ? (
          confirmar ? (
            <form action={dispatch} className="flex items-center gap-1.5">
              <input type="hidden" name="chaveId" value={c.id} />
              <Btn type="submit" tamanho="sm" variante="perigo" disabled={pendente}>
                <Check /> {pendente ? "Revogando..." : "Confirmar revogação"}
              </Btn>
              <Btn type="button" tamanho="sm" variante="fantasma" onClick={() => setConfirmar(false)} aria-label="Cancelar">
                <X />
              </Btn>
            </form>
          ) : (
            <Btn type="button" tamanho="sm" variante="fantasma" className="text-red-300/80 hover:text-red-200" onClick={() => setConfirmar(true)}>
              <Ban /> Revogar
            </Btn>
          )
        ) : null}
      </div>
      {estado.erro ? (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {estado.erro}
        </p>
      ) : null}
    </li>
  );
}
