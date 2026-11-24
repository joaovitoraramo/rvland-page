"use client";

import * as React from "react";
import { useActionState } from "react";
import { ArrowDownToLine, Check, Container, Info } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { cn } from "@/lib/utils";
import type { CanalHermes } from "@/lib/hermes/documento";
import type { EstadoAcaoHermes } from "@/app/(app)/painel/hermes/actions";

type Acao = (estado: EstadoAcaoHermes, formData: FormData) => Promise<EstadoAcaoHermes>;

function Retorno({ estado }: { estado: EstadoAcaoHermes }) {
  return (
    <>
      {estado.erro ? (
        <p role="alert" className="text-xs text-red-300">
          {estado.erro}
        </p>
      ) : null}
      {estado.ok ? (
        <p role="status" className="text-xs text-emerald-300">
          {estado.ok}
        </p>
      ) : null}
    </>
  );
}

const chip = (ativo: boolean) =>
  cn(
    "inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
    ativo
      ? "border-[rgba(0,229,255,0.45)] bg-[rgba(0,229,255,0.12)] text-[#8AF0FF]"
      : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white"
  );

/** Canal da instalação (stable | preview). Troca com confirmação; vale no próximo sync (até 1 min). */
export function SeletorCanalHermes({ instalacaoId, canal, podeEditar, acao }: { instalacaoId: string; canal: CanalHermes; podeEditar: boolean; acao: Acao }) {
  const [estado, dispatch, pendente] = useActionState<EstadoAcaoHermes, FormData>(acao, {});
  const [escolhido, setEscolhido] = React.useState<CanalHermes>(canal);
  const mudou = escolhido !== canal;

  return (
    <form action={dispatch} className="space-y-3">
      <input type="hidden" name="instalacaoId" value={instalacaoId} />
      <input type="hidden" name="canal" value={escolhido} />
      <div role="radiogroup" aria-label="Canal da instalação" className="flex flex-wrap gap-1.5">
        {(["stable", "preview"] as const).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={escolhido === c} disabled={!podeEditar} onClick={() => setEscolhido(c)} className={cn(chip(escolhido === c), "font-mono")}>
            {c}
          </button>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-white/45">
        {escolhido === "preview"
          ? "preview recebe versões em teste, antes do stable."
          : "stable recebe só versões já validadas."}
      </p>
      {podeEditar && mudou ? (
        <div className="flex flex-wrap items-center gap-2">
          <Btn type="submit" tamanho="sm" variante="primario" disabled={pendente}>
            <Check /> {pendente ? "Trocando..." : `Trocar para ${escolhido}`}
          </Btn>
          <Btn type="button" tamanho="sm" variante="fantasma" onClick={() => setEscolhido(canal)}>
            Cancelar
          </Btn>
        </div>
      ) : null}
      <Retorno estado={estado} />
    </form>
  );
}

/**
 * Atualização forçada.
 *  - Agente RV: usa o mecanismo existente (pin de versão do servidor, entregue como `agente_alvo` no sync).
 *  - Container: o servidor ainda não tem `digest_alvo`; o botão chama o serviço isolado e mostra o aviso.
 */
export function AtualizacaoHermes({
  instalacaoId,
  versaoAlvo,
  versoes,
  agenteVersao,
  semServidor,
  podeForcar,
  acaoAgente,
  acaoContainer,
}: {
  instalacaoId: string;
  versaoAlvo: string | null;
  versoes: string[];
  agenteVersao: string | null;
  semServidor: boolean;
  podeForcar: boolean;
  acaoAgente: Acao;
  acaoContainer: Acao;
}) {
  const [estadoAg, despAg, pendAg] = useActionState<EstadoAcaoHermes, FormData>(acaoAgente, {});
  const [estadoCt, despCt, pendCt] = useActionState<EstadoAcaoHermes, FormData>(acaoContainer, {});
  const [escolhida, setEscolhida] = React.useState<string>(versaoAlvo ?? "auto");
  const mudou = escolhida !== (versaoAlvo ?? "auto");
  const opcoes = ["auto", ...Array.from(new Set([...(versaoAlvo ? [versaoAlvo] : []), ...versoes])).slice(0, 8)];

  return (
    <div className="space-y-5">
      <form action={despAg} className="space-y-3">
        <input type="hidden" name="instalacaoId" value={instalacaoId} />
        <input type="hidden" name="versao" value={escolhida} />
        <div>
          <div className="rv-eyebrow">agente RV</div>
          <p className="mt-1 text-xs leading-relaxed text-white/45">
            Instalado: <span className="rv-num text-white/70">{agenteVersao ?? "—"}</span>. Alvo:{" "}
            <span className="rv-num text-white/70">{versaoAlvo ?? "automático (última estável)"}</span>. O agente atualiza no próximo contato.
          </p>
        </div>
        {semServidor ? (
          <p className="text-xs text-white/40">A instalação ainda não tem servidor: não há agente para atualizar.</p>
        ) : (
          <>
            <div role="radiogroup" aria-label="Versão do agente" className="flex flex-wrap gap-1.5">
              {opcoes.map((v) => (
                <button key={v} type="button" role="radio" aria-checked={escolhida === v} disabled={!podeForcar} onClick={() => setEscolhida(v)} className={cn(chip(escolhida === v), v !== "auto" && "rv-num")}>
                  {v === "auto" ? "Automático" : v}
                </button>
              ))}
            </div>
            {podeForcar && mudou ? (
              <div className="flex flex-wrap items-center gap-2">
                <Btn type="submit" tamanho="sm" variante="primario" disabled={pendAg}>
                  <ArrowDownToLine /> {pendAg ? "Aplicando..." : escolhida === "auto" ? "Voltar ao automático" : `Forçar ${escolhida}`}
                </Btn>
                <Btn type="button" tamanho="sm" variante="fantasma" onClick={() => setEscolhida(versaoAlvo ?? "auto")}>
                  Cancelar
                </Btn>
              </div>
            ) : null}
          </>
        )}
        <Retorno estado={estadoAg} />
      </form>

      <form action={despCt} className="space-y-2 border-t border-white/8 pt-4">
        <input type="hidden" name="instalacaoId" value={instalacaoId} />
        <div>
          <div className="rv-eyebrow">container</div>
          <p className="mt-1 text-xs leading-relaxed text-white/45">Forçar o digest do container ainda não está disponível no servidor.</p>
        </div>
        {podeForcar ? (
          <Btn type="submit" tamanho="sm" variante="secundario" disabled={pendCt}>
            <Container /> {pendCt ? "Verificando..." : "Forçar atualização do container"}
          </Btn>
        ) : null}
        {estadoCt.erro ? (
          <p role="status" className="flex items-start gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-2.5 py-2 text-xs leading-relaxed text-[#FFD58A]">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {estadoCt.erro}
          </p>
        ) : null}
      </form>
    </div>
  );
}
