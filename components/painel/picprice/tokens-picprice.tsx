"use client";

import * as React from "react";
import { useActionState } from "react";
import { Ban, Check, Clock3, Eye, EyeOff, KeyRound, RefreshCw, RotateCcw, Search, X } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { Copiavel } from "@/components/painel/copiavel";
import { formatarDataHoraBR } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { EstadoTokenPicPrice } from "@/app/(app)/painel/picprice/actions";
import { diasAte, situacaoDoItem, type ItemToken, type Situacao } from "@/lib/picprice/situacao";

/**
 * Lista de tokens do RV Pic Price: um cartão por cliente, com tudo o que o
 * suporte mexe no dia a dia (cota, validade, nome do estabelecimento, token).
 * Sem controle nativo: validade em chips, estado em segmentos, nome em switch.
 */

type AcaoForm = (formData: FormData) => Promise<void>;
type AcaoGerar = (estado: EstadoTokenPicPrice, formData: FormData) => Promise<EstadoTokenPicPrice>;

export type AcoesToken = {
  gerar: AcaoGerar;
  revogar: AcaoForm;
  reativar: AcaoForm;
  limite: AcaoForm;
  validade: AcaoForm;
  verEstabelecimento: AcaoForm;
};

const FILTROS = [
  { chave: "todos", rotulo: "Todos" },
  { chave: "ativo", rotulo: "Ativos" },
  { chave: "vencendo", rotulo: "Vencendo" },
  { chave: "revogado", rotulo: "Revogados" },
  { chave: "sem_token", rotulo: "Sem token" },
] as const;
type Filtro = (typeof FILTROS)[number]["chave"];

export function TokensPicPrice({ itens, gerencia, acoes }: { itens: ItemToken[]; gerencia: boolean; acoes: AcoesToken }) {
  const [busca, setBusca] = React.useState("");
  const [filtro, setFiltro] = React.useState<Filtro>("todos");

  const contagem = React.useMemo(() => {
    const c: Record<Filtro, number> = { todos: itens.length, ativo: 0, vencendo: 0, revogado: 0, sem_token: 0 };
    for (const i of itens) {
      const s = situacaoDoItem(i);
      if (s === "ativo") c.ativo++;
      else if (s === "vencendo" || s === "expirado") c.vencendo++;
      else if (s === "revogado") c.revogado++;
      else c.sem_token++;
    }
    return c;
  }, [itens]);

  const termo = busca.trim().toLowerCase();
  const soDigitos = termo.replace(/\D/g, "");
  const visiveis = itens.filter((i) => {
    const s = situacaoDoItem(i);
    if (filtro === "ativo" && s !== "ativo") return false;
    if (filtro === "vencendo" && s !== "vencendo" && s !== "expirado") return false;
    if (filtro === "revogado" && s !== "revogado") return false;
    if (filtro === "sem_token" && s !== "sem_token") return false;
    if (!termo) return true;
    return (
      i.cliente.toLowerCase().includes(termo) ||
      (soDigitos.length > 0 && i.cnpj.includes(soDigitos)) ||
      (i.prefixo ?? "").toLowerCase().includes(termo)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="relative block w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Cliente, CNPJ ou início do token"
            aria-label="Buscar cliente"
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

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar por situação">
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
          <p className="text-sm text-white/70">Nenhum cliente nesse filtro.</p>
          <p className="mt-1 text-xs text-white/40">Troque o filtro ou limpe a busca.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {visiveis.map((i) => (
            <CartaoToken key={i.clienteId} item={i} gerencia={gerencia} acoes={acoes} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cartão do cliente ─────────────────────────────────────────────────────────

function CartaoToken({ item, gerencia, acoes }: { item: ItemToken; gerencia: boolean; acoes: AcoesToken }) {
  const situacao = situacaoDoItem(item);
  const dias = diasAte(item.expiraEm);

  return (
    <article
      className={cn(
        "rounded-2xl border bg-gradient-to-b from-white/[0.045] to-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
        situacao === "revogado" || situacao === "expirado" ? "border-red-500/15" : situacao === "vencendo" ? "border-amber-400/20" : "border-white/8"
      )}
    >
      {/* Cabeçalho: quem é, situação, token, último uso */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/6 px-4 py-3 md:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold text-white">{item.cliente}</h3>
            <BadgeSituacao situacao={situacao} dias={dias} />
          </div>
          <div className="rv-num mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/45">
            <span>{item.cnpj}</span>
            {item.prefixo ? (
              <span className="inline-flex items-center gap-1 text-white/60">
                <KeyRound className="size-3 text-white/35" />
                {item.prefixo}…
              </span>
            ) : null}
          </div>
        </div>
        <div className="rv-num text-right text-xs text-white/45">
          <span className="rv-eyebrow block text-[10px]">último uso</span>
          <span className={item.ultimoUsoEm ? "text-white/70" : ""}>{item.ultimoUsoEm ? formatarDataHoraBR(new Date(item.ultimoUsoEm)) : "nunca"}</span>
        </div>
      </header>

      {item.temToken ? (
        <div className="grid divide-y divide-white/6 md:grid-cols-[1fr_1.15fr_0.9fr_17rem] md:divide-x md:divide-y-0">
          <BlocoUso item={item} gerencia={gerencia} acao={acoes.limite} />
          <BlocoValidade item={item} dias={dias} gerencia={gerencia} acao={acoes.validade} />
          <BlocoNome item={item} gerencia={gerencia} acao={acoes.verEstabelecimento} />
          <BlocoToken item={item} gerencia={gerencia} acoes={acoes} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-5">
          <p className="text-sm text-white/50">Cliente ainda sem token. Gere um para ele usar o RV Pic Price no Hermes.</p>
          {gerencia ? <GerarToken acao={acoes.gerar} clienteId={item.clienteId} troca={false} /> : null}
        </div>
      )}
    </article>
  );
}

function BadgeSituacao({ situacao, dias }: { situacao: Situacao; dias: number | null }) {
  const mapa = {
    ativo: { texto: "ativo", classe: "border-[rgba(0,255,138,0.25)] bg-[rgba(0,255,138,0.08)] text-[#7DFFC4]" },
    vencendo: { texto: dias === 0 ? "vence hoje" : `vence em ${dias} dia${dias === 1 ? "" : "s"}`, classe: "border-amber-400/30 bg-amber-400/10 text-[#FFD58A]" },
    expirado: { texto: "expirado", classe: "border-red-500/30 bg-red-500/10 text-red-200" },
    revogado: { texto: "revogado", classe: "border-red-500/30 bg-red-500/10 text-red-200" },
    sem_token: { texto: "sem token", classe: "border-white/10 bg-white/5 text-white/45" },
  } as const;
  const m = mapa[situacao];
  return <span className={cn("inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-medium", m.classe)}>{m.texto}</span>;
}

function Bloco({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2.5 px-4 py-3.5 md:px-5", className)}>
      <div className="rv-eyebrow">{rotulo}</div>
      {children}
    </div>
  );
}

// ── Uso hoje ──────────────────────────────────────────────────────────────────

function BlocoUso({ item, gerencia, acao }: { item: ItemToken; gerencia: boolean; acao: AcaoForm }) {
  const pct = Math.min(100, Math.round((item.usado / Math.max(1, item.limite)) * 100));
  const cheio = item.usado >= item.limite;
  const cor = cheio ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : "bg-gradient-to-r from-[#00E5FF] to-[#00FF8A]";
  const [limite, setLimite] = React.useState(String(item.limite));
  const mudou = limite !== "" && Number(limite) !== item.limite;

  return (
    <Bloco rotulo="uso hoje">
      <div className="flex items-baseline justify-between gap-3">
        <div className="rv-num text-2xl font-semibold leading-none text-white">
          {item.usado}
          <span className="text-sm font-normal text-white/35"> / {item.limite}</span>
        </div>
        <span className={cn("rv-num text-xs", cheio ? "rv-fosforo-vermelho" : "text-white/40")}>{cheio ? "limite atingido" : `${pct}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div className={cn("h-full rounded-full transition-[width]", cor)} style={{ width: `${Math.max(pct > 0 ? 3 : 0, pct)}%` }} />
      </div>
      {gerencia ? (
        <form action={acao} className="flex items-center gap-2">
          <input type="hidden" name="clienteId" value={item.clienteId} />
          <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-2.5 text-[11px] text-white/45 transition-colors focus-within:border-[rgba(0,229,255,0.45)]">
            <span className="shrink-0 whitespace-nowrap">limite diário</span>
            <input
              name="limite"
              value={limite}
              onChange={(e) => setLimite(e.target.value.replace(/\D/g, "").slice(0, 7))}
              inputMode="numeric"
              pattern="[0-9]*"
              required
              aria-label="Limite diário de requisições"
              className="rv-num !h-7 !w-full !min-w-0 !rounded-none !border-0 !bg-transparent !px-0 text-right !text-sm text-white outline-none !shadow-none focus-visible:!shadow-none"
            />
          </label>
          <Btn type="submit" tamanho="sm" variante={mudou ? "primario" : "secundario"} disabled={!mudou || Number(limite) < 1} className="w-[4.5rem]">
            Salvar
          </Btn>
        </form>
      ) : null}
    </Bloco>
  );
}

// ── Validade ──────────────────────────────────────────────────────────────────

const PRESETS = [
  { valor: "1m", rotulo: "+1 mês" },
  { valor: "3m", rotulo: "+3 meses" },
  { valor: "6m", rotulo: "+6 meses" },
  { valor: "1a", rotulo: "+1 ano" },
  { valor: "nao_expira", rotulo: "sem prazo" },
] as const;

function BlocoValidade({ item, dias, gerencia, acao }: { item: ItemToken; dias: number | null; gerencia: boolean; acao: AcaoForm }) {
  const expirado = dias !== null && dias <= 0;
  const vencendo = dias !== null && dias > 0 && dias <= 7;
  return (
    <Bloco rotulo="validade">
      <div className="flex flex-col gap-1">
        <div className={cn("rv-num whitespace-nowrap text-2xl font-semibold leading-none", expirado ? "rv-fosforo-vermelho" : vencendo ? "rv-fosforo-ambar" : "text-white")}>
          {dias === null ? "∞" : expirado ? "expirado" : dias === 0 ? "hoje" : `${dias} dia${dias === 1 ? "" : "s"}`}
        </div>
        <span className="rv-num text-xs text-white/40">
          {item.expiraEm ? `até ${formatarDataHoraBR(new Date(item.expiraEm))}` : "não expira"}
        </span>
      </div>
      {gerencia ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <form key={p.valor} action={acao}>
              <input type="hidden" name="clienteId" value={item.clienteId} />
              <input type="hidden" name="validade" value={p.valor} />
              <button
                type="submit"
                className="inline-flex h-7 items-center rounded-md border border-white/10 bg-white/[0.03] px-2 text-[11px] font-medium text-white/65 transition-colors hover:border-[rgba(0,229,255,0.35)] hover:bg-[rgba(0,229,255,0.08)] hover:text-white"
              >
                {p.rotulo}
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </Bloco>
  );
}

// ── Nome do estabelecimento ───────────────────────────────────────────────────

function BlocoNome({ item, gerencia, acao }: { item: ItemToken; gerencia: boolean; acao: AcaoForm }) {
  const ver = item.verEstabelecimento;
  return (
    <Bloco rotulo="nome do estabelecimento">
      <form action={acao} className="flex items-center gap-3">
        <input type="hidden" name="clienteId" value={item.clienteId} />
        <input type="hidden" name="ver" value={ver ? "false" : "true"} />
        <button
          type="submit"
          role="switch"
          aria-checked={ver}
          disabled={!gerencia}
          aria-label={ver ? "Ocultar nome do estabelecimento" : "Liberar nome do estabelecimento"}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-default",
            ver ? "border-[rgba(0,255,138,0.4)] bg-[rgba(0,255,138,0.25)]" : "border-white/15 bg-white/10"
          )}
        >
          <span
            className={cn(
              "absolute top-1/2 size-4 -translate-y-1/2 rounded-full shadow transition-[left]",
              ver ? "left-[calc(100%-1.125rem)] bg-[#7DFFC4]" : "left-0.5 bg-white/70"
            )}
          />
        </button>
        <div className="min-w-0">
          <div className={cn("flex items-center gap-1.5 text-sm font-medium", ver ? "text-[#7DFFC4]" : "text-white/70")}>
            {ver ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {ver ? "liberado" : "oculto"}
          </div>
          <div className="text-[11px] leading-tight text-white/35">{ver ? "o ranking mostra quem vende" : "o ranking só traz os preços"}</div>
        </div>
      </form>
    </Bloco>
  );
}

// ── Token: trocar / revogar / reativar ────────────────────────────────────────

function BlocoToken({ item, gerencia, acoes }: { item: ItemToken; gerencia: boolean; acoes: AcoesToken }) {
  const [confirmar, setConfirmar] = React.useState(false);
  if (!gerencia) {
    return (
      <Bloco rotulo="token">
        <div className="rv-num text-xs text-white/45">criado em {item.criadoEm ? formatarDataHoraBR(new Date(item.criadoEm)) : "—"}</div>
      </Bloco>
    );
  }
  return (
    <Bloco rotulo="token">
      <div className="flex flex-col gap-2">
        <GerarToken acao={acoes.gerar} clienteId={item.clienteId} troca />
        {item.status === "ativo" ? (
          confirmar ? (
            <form action={acoes.revogar} className="flex items-center gap-1.5">
              <input type="hidden" name="clienteId" value={item.clienteId} />
              <Btn type="submit" tamanho="sm" variante="perigo" className="flex-1">
                <Check /> Confirmar
              </Btn>
              <Btn type="button" tamanho="sm" variante="fantasma" onClick={() => setConfirmar(false)} aria-label="Cancelar">
                <X />
              </Btn>
            </form>
          ) : (
            <Btn type="button" tamanho="sm" variante="fantasma" className="justify-start text-red-300/80 hover:text-red-200" onClick={() => setConfirmar(true)}>
              <Ban /> Revogar
            </Btn>
          )
        ) : (
          <form action={acoes.reativar}>
            <input type="hidden" name="clienteId" value={item.clienteId} />
            <Btn type="submit" tamanho="sm" className="w-full">
              <RotateCcw /> Reativar
            </Btn>
          </form>
        )}
        {item.revogadoEm && item.status === "revogado" ? (
          <div className="rv-num text-[11px] text-white/35">revogado em {formatarDataHoraBR(new Date(item.revogadoEm))}</div>
        ) : null}
      </div>
    </Bloco>
  );
}

/**
 * Gera ou troca o token do cliente. A validade é escolhida em chips (sem
 * select); o token cru aparece UMA vez, com botão de copiar.
 */
function GerarToken({ acao, clienteId, troca }: { acao: AcaoGerar; clienteId: string; troca: boolean }) {
  const [estado, dispatch, pendente] = useActionState<EstadoTokenPicPrice, FormData>(acao, {});
  const [aberto, setAberto] = React.useState(!troca);
  const [validade, setValidade] = React.useState("1m");

  if (estado.token) {
    return (
      <div className="w-full max-w-md space-y-1.5">
        <Copiavel rotulo="token novo — copie agora" valor={estado.token} />
        <p className="text-[11px] leading-snug text-white/40">Não será mostrado de novo. Cole na Área Técnica do Hermes do cliente.</p>
      </div>
    );
  }

  if (!aberto) {
    return (
      <Btn type="button" tamanho="sm" variante="secundario" className="w-full justify-start" onClick={() => setAberto(true)}>
        <RefreshCw /> Trocar token
      </Btn>
    );
  }

  return (
    <form action={dispatch} className="flex flex-col gap-2">
      <input type="hidden" name="clienteId" value={clienteId} />
      <input type="hidden" name="validade" value={validade} />
      {troca ? <input type="hidden" name="troca" value="1" /> : null}
      <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Validade do token novo">
        {[
          { v: "1m", r: "1 mês" },
          { v: "3m", r: "3 meses" },
          { v: "6m", r: "6 meses" },
          { v: "1a", r: "1 ano" },
          { v: "nao_expira", r: "sem prazo" },
        ].map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={validade === o.v}
            onClick={() => setValidade(o.v)}
            className={cn(
              "inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-medium transition-colors",
              validade === o.v
                ? "border-[rgba(0,229,255,0.45)] bg-[rgba(0,229,255,0.12)] text-[#8AF0FF]"
                : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white"
            )}
          >
            {o.r}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Btn type="submit" tamanho="sm" variante="primario" disabled={pendente} className="flex-1">
          {troca ? <RefreshCw /> : <KeyRound />}
          {pendente ? "Gerando…" : troca ? "Gerar novo token" : "Gerar token"}
        </Btn>
        {troca ? (
          <Btn type="button" tamanho="sm" variante="fantasma" onClick={() => setAberto(false)} aria-label="Cancelar">
            <X />
          </Btn>
        ) : null}
      </div>
      {troca ? (
        <p className="flex items-start gap-1 text-[11px] leading-snug text-amber-200/70">
          <Clock3 className="mt-px size-3 shrink-0" />
          O token atual para de valer na hora; todos os servidores do cliente precisam do novo.
        </p>
      ) : null}
      {estado.erro ? (
        <p role="alert" className="text-xs text-red-300">
          {estado.erro}
        </p>
      ) : null}
    </form>
  );
}
