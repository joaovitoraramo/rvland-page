"use client";

import * as React from "react";
import { Activity, Wrench } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { cn } from "@/lib/utils";

type Estado = "operante" | "manutencao";

/**
 * Barra do status global do serviço. Operante: uma linha discreta. Em
 * manutenção (ou ao abrir para mudar): mostra mensagem e previsão, que todo
 * cliente recebe no lugar dos preços.
 */
export function StatusServicoPicPrice({
  estado,
  mensagem,
  previsao,
  gerencia,
  acao,
}: {
  estado: Estado;
  mensagem: string | null;
  previsao: string | null;
  gerencia: boolean;
  acao: (formData: FormData) => Promise<void>;
}) {
  const [escolhido, setEscolhido] = React.useState<Estado>(estado);
  const [editando, setEditando] = React.useState(estado === "manutencao");
  const manutencao = estado === "manutencao";
  const mudou = escolhido !== estado;

  const campoClasse =
    "h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-[rgba(0,229,255,0.45)] focus:ring-[3px] focus:ring-[rgba(0,229,255,0.15)]";

  return (
    <section
      className={cn(
        "rounded-2xl border px-4 py-3 md:px-5",
        manutencao ? "border-amber-400/25 bg-amber-400/[0.06]" : "border-white/8 bg-white/[0.02]"
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="relative grid size-8 shrink-0 place-items-center">
            <span className={cn("absolute inset-0 rounded-full opacity-30 blur-md", manutencao ? "bg-amber-400" : "bg-emerald-400")} />
            {manutencao ? <Wrench className="relative size-4 text-[#FFD58A]" /> : <Activity className="relative size-4 text-[#7DFFC4]" />}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">
              {manutencao ? "Serviço em manutenção programada" : "Serviço operante"}
            </div>
            <div className="truncate text-xs text-white/45">
              {manutencao
                ? [mensagem, previsao ? `previsão: ${previsao}` : null].filter(Boolean).join(" · ") || "Os clientes recebem o aviso de manutenção no lugar dos preços."
                : "Todos os clientes com token ativo estão consultando preços."}
            </div>
          </div>
        </div>

        {gerencia ? (
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Estado do serviço" className="inline-flex h-9 rounded-xl border border-white/10 bg-black/30 p-0.5">
              {(
                [
                  { v: "operante", r: "Operante" },
                  { v: "manutencao", r: "Manutenção" },
                ] as const
              ).map((o) => {
                const ativo = escolhido === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => {
                      setEscolhido(o.v);
                      setEditando(true);
                    }}
                    className={cn(
                      "inline-flex h-full items-center rounded-[10px] px-3 text-xs font-medium transition-colors",
                      ativo
                        ? o.v === "manutencao"
                          ? "bg-amber-400/15 text-[#FFD58A]"
                          : "bg-[rgba(0,255,138,0.12)] text-[#7DFFC4]"
                        : "text-white/50 hover:text-white"
                    )}
                  >
                    {o.r}
                  </button>
                );
              })}
            </div>
            {!editando ? (
              <Btn type="button" tamanho="sm" variante="fantasma" onClick={() => setEditando(true)}>
                Editar aviso
              </Btn>
            ) : null}
          </div>
        ) : null}
      </div>

      {gerencia && editando ? (
        <form action={acao} className="mt-3 grid gap-3 border-t border-white/8 pt-3 md:grid-cols-[1fr_220px_auto] md:items-end">
          <input type="hidden" name="estado" value={escolhido} />
          <label className="grid gap-1 text-xs text-white/55">
            Mensagem para os clientes (opcional)
            <input name="mensagem" defaultValue={mensagem ?? ""} placeholder="Ex.: atualização do serviço" maxLength={240} className={campoClasse} />
          </label>
          <label className="grid gap-1 text-xs text-white/55">
            Previsão de volta (opcional)
            <input name="previsao" defaultValue={previsao ?? ""} placeholder="Ex.: hoje às 18h" maxLength={80} className={campoClasse} />
          </label>
          <div className="flex items-center gap-2">
            <Btn type="submit" variante={mudou || manutencao ? "primario" : "secundario"}>
              {escolhido === "manutencao" ? "Entrar em manutenção" : mudou ? "Voltar a operante" : "Salvar aviso"}
            </Btn>
            <Btn
              type="button"
              variante="fantasma"
              onClick={() => {
                setEscolhido(estado);
                setEditando(manutencao);
              }}
            >
              Cancelar
            </Btn>
          </div>
        </form>
      ) : null}
    </section>
  );
}
