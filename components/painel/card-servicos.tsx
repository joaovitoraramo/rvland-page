import { Activity, KeyRound, Play, Plus, Square, Trash2, Unlock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Btn } from "@/components/painel/ui";
import { SnapshotStatus } from "@/components/painel/snapshot-status";
import { FormServico } from "@/components/painel/form-servico";
import {
  alternarLicencaServico,
  enfileirarComando,
  removerServico,
  type EstadoServico,
} from "@/app/(app)/painel/servidores/actions";

type Servico = {
  id: string;
  nome: string;
  unidadeSystemd: string;
  licenciado: boolean;
  statusReportado: "ativo" | "inativo" | "desconhecido";
};

type Snapshot = { texto: string; quando: Date } | undefined;

const PILL: Record<string, { classe: string; dot: string }> = {
  ativo: { classe: "bg-[rgba(0,255,138,0.1)] text-[#7DFFC4]", dot: "bg-[#00FF8A]" },
  inativo: { classe: "bg-[rgba(255,93,93,0.1)] text-[#FF9D9D]", dot: "bg-[#FF5D5D]" },
  desconhecido: { classe: "bg-white/5 text-white/40", dot: "bg-white/30" },
};

export function CardServicos({
  servidorId,
  servicos,
  snapshots,
  pendentes,
  podeExecutar,
  podeEditar,
  acaoServico,
}: {
  servidorId: string;
  servicos: Servico[];
  snapshots: Map<string, Snapshot>;
  pendentes: { id: string; verbo: string }[];
  podeExecutar: boolean;
  podeEditar: boolean;
  acaoServico: (estado: EstadoServico, formData: FormData) => Promise<EstadoServico>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base text-white">
          Serviços
          <span className="rv-eyebrow">{servicos.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {servicos.length === 0 ? (
          <p className="py-2 text-sm text-white/40">Nenhum serviço cadastrado ainda.</p>
        ) : (
          servicos.map((s) => {
            const pill = PILL[s.statusReportado];
            const snap = snapshots.get(s.id);
            return (
              <div key={s.id} className="rounded-xl border border-white/8 bg-black/25 p-4">
                {/* linha 1: nome + status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-white">{s.nome}</span>
                    <div className="rv-num mt-1 truncate text-xs text-white/45">{s.unidadeSystemd}</div>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] ${pill.classe}`}
                  >
                    <span className={`size-1.5 rounded-full ${pill.dot}`} />
                    {s.statusReportado}
                  </span>
                </div>

                {/* toggle de licença: clicável quando pode editar, senão chip estático */}
                <div className="mt-2.5">
                  {podeEditar ? (
                    <form action={alternarLicencaServico.bind(null, s.id, servidorId)}>
                      <button
                        type="submit"
                        title={
                          s.licenciado
                            ? "Licenciado — o bloqueio para este serviço. Clique para desmarcar."
                            : "Não entra no bloqueio. Clique para marcar como licenciado."
                        }
                        className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          s.licenciado
                            ? "border-[rgba(0,229,255,0.3)] bg-[rgba(0,229,255,0.08)] text-[#8AF0FF] hover:bg-[rgba(0,229,255,0.14)]"
                            : "border-white/12 bg-white/[0.03] text-white/45 hover:bg-white/[0.06] hover:text-white/70"
                        }`}
                      >
                        <span
                          className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${
                            s.licenciado ? "bg-[rgba(0,229,255,0.5)]" : "bg-white/15"
                          }`}
                        >
                          <span
                            className={`absolute size-2.5 rounded-full bg-white transition-all ${
                              s.licenciado ? "left-[11px]" : "left-0.5"
                            }`}
                          />
                        </span>
                        {s.licenciado ? <KeyRound className="size-3" /> : <Unlock className="size-3" />}
                        {s.licenciado ? "Licenciado" : "Sem licença"}
                      </button>
                    </form>
                  ) : s.licenciado ? (
                    <span className="rv-eyebrow inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,229,255,0.2)] px-2 py-0.5 !text-[#8AF0FF]">
                      <KeyRound className="size-3" /> licenciado
                    </span>
                  ) : null}
                </div>

                {/* linha 2: ações */}
                {podeExecutar || podeEditar ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-3">
                    {podeExecutar ? (
                      <>
                        <form action={enfileirarComando.bind(null, servidorId, "start", s.id)}>
                          <Btn type="submit" tamanho="sm" variante="secundario">
                            <Play className="size-3" /> Start
                          </Btn>
                        </form>
                        <form action={enfileirarComando.bind(null, servidorId, "stop", s.id)}>
                          <Btn type="submit" tamanho="sm" variante="perigo">
                            <Square className="size-3" /> Stop
                          </Btn>
                        </form>
                        <form action={enfileirarComando.bind(null, servidorId, "status", s.id)}>
                          <Btn type="submit" tamanho="sm" variante="secundario">
                            <Activity className="size-3" /> Status
                          </Btn>
                        </form>
                      </>
                    ) : null}
                    {podeEditar ? (
                      <form action={removerServico.bind(null, s.id, servidorId)} className="ml-auto">
                        <button
                          type="submit"
                          aria-label={`Remover ${s.nome}`}
                          className="grid size-7 place-items-center rounded-lg text-white/30 transition-colors hover:bg-white/5 hover:text-red-300"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}

                {/* snapshot do systemctl status */}
                {snap ? <SnapshotStatus texto={snap.texto} quando={snap.quando} /> : null}
              </div>
            );
          })
        )}

        {pendentes.length > 0 ? (
          <div className="rounded-xl border border-[rgba(255,194,77,0.2)] bg-[rgba(255,194,77,0.05)] px-3 py-2.5">
            <div className="rv-eyebrow mb-1.5 !text-[#FFD58A]">na fila — aplicados no próximo heartbeat</div>
            <div className="flex flex-wrap gap-1.5">
              {pendentes.map((c) => (
                <span key={c.id} className="rv-num rounded border border-white/10 px-1.5 py-0.5 text-xs text-white/70">
                  {c.verbo}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {podeEditar ? (
          <details className="group rounded-xl border border-white/8 bg-white/[0.02]">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm text-white/60 transition-colors hover:text-white">
              <Plus className="size-4" />
              Adicionar serviço
            </summary>
            <div className="px-4 pb-4">
              <FormServico acao={acaoServico} />
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
