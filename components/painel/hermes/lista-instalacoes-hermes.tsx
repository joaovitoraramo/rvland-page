"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Search, X } from "lucide-react";

import { BadgeServidor } from "@/components/painel/badge-servidor";
import { Btn } from "@/components/painel/ui";
import { formatarDataHoraBR } from "@/lib/formato";
import { formatarCnpj, formatarDataCivil } from "@/lib/hermes/painel";
import { cn } from "@/lib/utils";
import type { LinhaInstalacao } from "@/lib/servicos/hermes-painel";
import {
  BadgeCanalHermes,
  BadgeCloneHermes,
  BadgeInstalacaoHermes,
  BadgeLicencaHermes,
  BadgeModoHermes,
  BadgeSaudeHermes,
} from "./badges-hermes";

const FILTROS = [
  { chave: "todas", rotulo: "Todas" },
  { chave: "online", rotulo: "Online" },
  { chave: "offline", rotulo: "Offline" },
  { chave: "carencia", rotulo: "Em carência" },
  { chave: "bloqueadas", rotulo: "Bloqueadas" },
  { chave: "clone", rotulo: "Clone suspeito" },
  { chave: "aguardando", rotulo: "Aguardando" },
] as const;
type Filtro = (typeof FILTROS)[number]["chave"];

function casa(l: LinhaInstalacao, f: Filtro): boolean {
  switch (f) {
    case "todas":
      return true;
    case "online":
      return l.statusServidor === "online";
    case "offline":
      return l.status === "ativa" && l.statusServidor === "offline";
    case "carencia":
      return l.licenca.status === "carencia";
    case "bloqueadas":
      return l.status === "ativa" && l.licenca.bloqueante;
    case "clone":
      return l.cloneSuspeitoEm !== null;
    case "aguardando":
      return l.status === "aguardando_ativacao";
  }
}

/** Instalações do Hermes: busca, filtros por situação e um cartão por instalação. */
export function ListaInstalacoesHermes({ linhas }: { linhas: LinhaInstalacao[] }) {
  const [busca, setBusca] = React.useState("");
  const [filtro, setFiltro] = React.useState<Filtro>("todas");

  const contagem = React.useMemo(() => {
    const c = {} as Record<Filtro, number>;
    for (const f of FILTROS) c[f.chave] = linhas.filter((l) => casa(l, f.chave)).length;
    return c;
  }, [linhas]);

  const termo = busca.trim().toLowerCase();
  const digitos = termo.replace(/\D/g, "");
  const visiveis = linhas.filter((l) => {
    if (!casa(l, filtro)) return false;
    if (!termo) return true;
    return (
      l.nome.toLowerCase().includes(termo) ||
      l.clienteNome.toLowerCase().includes(termo) ||
      (l.servidorNome ?? "").toLowerCase().includes(termo) ||
      (digitos.length > 0 && (l.cnpj ?? "").includes(digitos))
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Loja, cliente, servidor ou CNPJ"
            aria-label="Buscar instalação"
            className="!h-10 w-full !rounded-xl border border-white/10 bg-black/40 !pl-9 !pr-9 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-[rgba(0,229,255,0.45)] focus:ring-[3px] focus:ring-[rgba(0,229,255,0.15)]"
          />
          {busca ? (
            <button
              type="button"
              onClick={() => setBusca("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-white/40 hover:bg-white/10 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar instalações">
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
                <span className={cn("rv-num text-[11px]", ativo ? "text-[#8AF0FF]/80" : "text-white/30")}>{contagem[f.chave]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
          <p className="text-sm text-white/70">Nenhuma instalação nesse filtro.</p>
          <p className="mt-1 text-xs text-white/40">Troque o filtro ou limpe a busca.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {visiveis.map((l) => (
            <CartaoInstalacao key={l.id} l={l} />
          ))}
        </div>
      )}
    </div>
  );
}

function Bloco({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 px-4 py-3.5 md:px-5">
      <div className="rv-eyebrow">{rotulo}</div>
      {children}
    </div>
  );
}

function CartaoInstalacao({ l }: { l: LinhaInstalacao }) {
  const lic = l.licenca;
  return (
    <article
      className={cn(
        "rounded-2xl border bg-gradient-to-b from-white/[0.045] to-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
        (l.status === "ativa" && lic.bloqueante) || l.cloneSuspeitoEm ? "border-red-500/20" : lic.status === "carencia" ? "border-amber-400/20" : "border-white/8"
      )}
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/6 px-4 py-3 md:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-[15px] font-semibold text-white">
              <Link href={`/painel/hermes/${l.id}`} className="hover:text-[#8AF0FF]">
                {l.nome}
              </Link>
            </h3>
            <BadgeInstalacaoHermes status={l.status} />
            {l.cloneSuspeitoEm ? <BadgeCloneHermes /> : null}
          </div>
          <div className="rv-num mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/45">
            {l.clienteNome !== l.nome ? <span>{l.clienteNome}</span> : null}
            {l.cnpj ? <span>{formatarCnpj(l.cnpj)}</span> : null}
          </div>
        </div>
        <Btn asChild tamanho="sm" className="max-md:w-full">
          <Link href={`/painel/hermes/${l.id}`}>
            Detalhes <ArrowUpRight className="size-3.5" />
          </Link>
        </Btn>
      </header>

      <div className="grid grid-cols-2 divide-white/6 max-md:[&>*]:border-t max-md:[&>*]:border-white/6 md:grid-cols-4 md:divide-x">
        <Bloco rotulo="servidor">
          {l.statusServidor ? (
            <>
              <div>
                <BadgeServidor status={l.statusServidor} />
              </div>
              <div className="min-w-0 text-xs text-white/50">
                <div className="truncate text-white/70">{l.servidorNome}</div>
                <div className="rv-num mt-0.5">{l.ultimoContatoEm ? formatarDataHoraBR(new Date(l.ultimoContatoEm)) : "nunca falou"}</div>
              </div>
            </>
          ) : (
            <p className="text-sm text-white/40">Sem servidor vinculado ainda.</p>
          )}
        </Bloco>

        <Bloco rotulo="container">
          <div className="rv-num text-xl font-semibold leading-none text-white">{l.versao ?? "—"}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <BadgeSaudeHermes container={l.saude.container} saude={l.saude.saude} />
          </div>
          <div className="rv-num text-xs text-white/40">agente {l.agenteVersao ?? "—"}</div>
        </Bloco>

        <Bloco rotulo="canal">
          <div className="flex flex-wrap items-center gap-1.5">
            <BadgeCanalHermes canal={l.canal} />
          </div>
          <div className="text-xs text-white/40">
            {l.canalEmUso && l.canalEmUso !== l.canal ? `em uso: ${l.canalEmUso} (troca pendente)` : l.canalEmUso ? `em uso: ${l.canalEmUso}` : "ainda sem leitura"}
          </div>
        </Bloco>

        <Bloco rotulo="licença">
          <div className="flex flex-wrap items-center gap-1.5">
            <BadgeLicencaHermes status={lic.status} />
            <BadgeModoHermes modo={lic.modo} />
          </div>
          <div className="rv-num text-xs leading-relaxed text-white/45">
            {lic.status === "carencia" ? <div>carência até {formatarDataCivil(lic.carenciaAte)}</div> : null}
            {lic.expiraEm ? <div>vence {formatarDataCivil(lic.expiraEm)}</div> : null}
            {l.status !== "ativa" ? <div>vale depois de ativada</div> : lic.bloqueante ? <div className="text-red-300/80">{lic.modo === "valendo" ? "bloqueando agora" : "bloquearia (simulação)"}</div> : null}
            {l.enforcement === "simular" ? <div>exceção: sempre simula</div> : null}
          </div>
        </Bloco>
      </div>
    </article>
  );
}
