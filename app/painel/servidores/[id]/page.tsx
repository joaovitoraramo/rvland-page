import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import {
  Activity,
  ArrowUpRight,
  Ban,
  Clock,
  Cpu,
  HardDrive,
  MemoryStick,
  Play,
  Server,
  Square,
  Trash2,
  User,
} from "lucide-react";

import {
  db,
  servidores,
  clientes,
  servicoGerenciados,
  telemetriaAtual,
  eventos,
  comandos,
} from "@/lib/db";
import { exigirPermissao, pode } from "@/lib/auth";
import { SITE_URL } from "@/lib/site";
import { statusAgora, segundosDesde } from "@/lib/consultas/servidores";
import {
  adicionarServico,
  enfileirarComando,
  regenerarToken,
  removerServico,
  revogarServidor,
} from "@/app/painel/servidores/actions";
import { PageHeader } from "@/components/painel/page-header";
import { BadgeServidor } from "@/components/painel/badge-servidor";
import { MonitorVivo } from "@/components/painel/monitor-vivo";
import { RevelarToken } from "@/components/painel/revelar-token";
import { FormServico } from "@/components/painel/form-servico";
import { Btn } from "@/components/painel/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarDataHoraBR } from "@/lib/formato";

export const metadata = { title: "Servidor" };

function Medidor({
  icone,
  rotulo,
  pct,
}: {
  icone: React.ReactNode;
  rotulo: string;
  pct: number | null;
}) {
  const cor = pct == null ? "#ffffff30" : pct >= 85 ? "#FF5D5D" : pct >= 60 ? "#FFC24D" : "#00FF8A";
  return (
    <div className="rounded-xl border border-white/8 bg-black/25 p-4">
      <div className="flex items-center gap-2 text-white/45 [&_svg]:size-3.5">
        {icone}
        <span className="rv-eyebrow">{rotulo}</span>
      </div>
      <div className="rv-num mt-2 text-2xl font-semibold text-white">
        {pct != null ? `${pct}` : "—"}
        {pct != null ? <span className="text-sm text-white/40">%</span> : null}
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct ?? 0}%`, background: cor }} />
      </div>
    </div>
  );
}

export default async function PaginaServidor({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await exigirPermissao("servidores.ver");
  const { id } = await params;

  const [servidor] = await db.select().from(servidores).where(eq(servidores.id, id));
  if (!servidor) notFound();

  const [[cliente], servicos, [tel], listaEventos, pendentes] = await Promise.all([
    db.select().from(clientes).where(eq(clientes.id, servidor.clienteId)),
    db
      .select()
      .from(servicoGerenciados)
      .where(eq(servicoGerenciados.servidorId, id))
      .orderBy(desc(servicoGerenciados.licenciado)),
    db.select().from(telemetriaAtual).where(eq(telemetriaAtual.servidorId, id)),
    db.select().from(eventos).where(eq(eventos.servidorId, id)).orderBy(desc(eventos.criadoEm)).limit(15),
    db
      .select()
      .from(comandos)
      .where(and(eq(comandos.servidorId, id), eq(comandos.estado, "pendente")))
      .limit(20),
  ]);

  const status = statusAgora({ status: servidor.status, ultimoContatoEm: servidor.ultimoContatoEm });
  const podeExecutar = pode(perfil, "servidores.executar") && servidor.status === "ativo";
  const podeEditar = pode(perfil, "servidores.editar");
  const ativo = servidor.status === "ativo";

  const acaoRevelar = regenerarToken.bind(null, id);
  const acaoServico = adicionarServico.bind(null, id);

  const uptimeStr =
    tel?.uptimeSeg != null
      ? `${Math.floor(tel.uptimeSeg / 86400)}d ${Math.floor((tel.uptimeSeg % 86400) / 3600)}h`
      : null;

  return (
    <>
      <PageHeader
        trilha="servidores"
        titulo={servidor.nome}
        descricao={[servidor.host, servidor.so].filter(Boolean).join(" · ") || undefined}
        acoes={
          <>
            {ativo ? <MonitorVivo segundosIniciais={segundosDesde(servidor.ultimoContatoEm)} /> : null}
            <BadgeServidor status={status} />
            {servidor.agenteVersao ? (
              <span className="rv-eyebrow rounded-full border border-white/12 px-3 py-1.5">
                v{servidor.agenteVersao}
              </span>
            ) : null}
          </>
        }
      />

      {/* barra de contexto: cliente + último contato */}
      <div className="rv-entrar mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/painel/clientes/${servidor.clienteId}`}
          className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-2.5 pr-3 text-sm text-white/80 transition-colors hover:border-[rgba(0,229,255,0.3)] hover:bg-white/[0.07] hover:text-white"
        >
          <User className="size-3.5 text-white/40 transition-colors group-hover:text-[#8AF0FF]" />
          {cliente?.nome}
          <ArrowUpRight className="size-3 text-white/30 transition-colors group-hover:text-[#8AF0FF]" />
        </Link>
        {ativo && servidor.ultimoContatoEm ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 px-3 py-1.5 font-mono text-[11px] text-white/45">
            <Clock className="size-3" />
            {formatarDataHoraBR(servidor.ultimoContatoEm)}
          </span>
        ) : null}
      </div>

      {/* servidor não-ativo: instalação em destaque */}
      {!ativo && pode(perfil, "servidores.cadastrar") ? (
        <div className="rv-entrar-1 mb-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-white">
                <Server className="size-4 text-[#8AF0FF]" />
                Instalação do agente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RevelarToken acao={acaoRevelar} siteUrl={SITE_URL} jaPendente={servidor.status === "pendente"} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* telemetria em faixa larga */}
      {ativo ? (
        <div className="rv-entrar-1 mb-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base text-white">
                Telemetria
                {uptimeStr ? (
                  <span className="rv-num text-xs font-normal text-white/40">uptime {uptimeStr}</span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Medidor icone={<Cpu />} rotulo="cpu" pct={tel?.cpuPct ?? null} />
                <Medidor icone={<MemoryStick />} rotulo="memória" pct={tel?.memoriaPct ?? null} />
                <Medidor icone={<HardDrive />} rotulo="disco" pct={tel?.discoPct ?? null} />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* serviços */}
        <Card className="rv-entrar-2">
          <CardHeader>
            <CardTitle className="text-base text-white">Serviços</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {servicos.length === 0 ? (
              <p className="text-sm text-white/40">Nenhum serviço cadastrado.</p>
            ) : (
              servicos.map((s) => (
                <div key={s.id} className="rounded-xl border border-white/8 bg-black/25 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{s.nome}</span>
                        {s.licenciado ? (
                          <span className="rv-eyebrow rounded border border-[rgba(0,229,255,0.2)] px-1.5 py-0.5 !text-[#8AF0FF]">
                            licenciado
                          </span>
                        ) : null}
                      </div>
                      <div className="rv-num mt-0.5 truncate text-xs text-white/45">{s.unidadeSystemd}</div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] ${
                        s.statusReportado === "ativo"
                          ? "bg-[rgba(0,255,138,0.1)] text-[#7DFFC4]"
                          : s.statusReportado === "inativo"
                            ? "bg-[rgba(255,93,93,0.1)] text-[#FF9D9D]"
                            : "bg-white/5 text-white/40"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          s.statusReportado === "ativo"
                            ? "bg-[#00FF8A]"
                            : s.statusReportado === "inativo"
                              ? "bg-[#FF5D5D]"
                              : "bg-white/30"
                        }`}
                      />
                      {s.statusReportado}
                    </span>
                  </div>

                  {podeExecutar || podeEditar ? (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {podeExecutar ? (
                        <>
                          <form action={enfileirarComando.bind(null, id, "start", s.id)}>
                            <Btn type="submit" tamanho="sm" variante="secundario">
                              <Play className="size-3" /> Start
                            </Btn>
                          </form>
                          <form action={enfileirarComando.bind(null, id, "stop", s.id)}>
                            <Btn type="submit" tamanho="sm" variante="perigo">
                              <Square className="size-3" /> Stop
                            </Btn>
                          </form>
                          <form action={enfileirarComando.bind(null, id, "status", s.id)}>
                            <Btn type="submit" tamanho="sm" variante="fantasma">
                              <Activity className="size-3" /> Status
                            </Btn>
                          </form>
                        </>
                      ) : null}
                      {podeEditar ? (
                        <form action={removerServico.bind(null, s.id, id)} className="ml-auto">
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
                </div>
              ))
            )}

            {pendentes.length > 0 ? (
              <div className="rounded-xl border border-[rgba(255,194,77,0.2)] bg-[rgba(255,194,77,0.05)] p-3">
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

            {podeEditar ? <FormServico acao={acaoServico} /> : null}
          </CardContent>
        </Card>

        {/* eventos */}
        <Card className="rv-entrar-3">
          <CardHeader>
            <CardTitle className="text-base text-white">Eventos</CardTitle>
          </CardHeader>
          <CardContent>
            {listaEventos.length === 0 ? (
              <p className="text-sm text-white/40">Nada registrado.</p>
            ) : (
              <ul className="space-y-3">
                {listaEventos.map((e) => (
                  <li
                    key={e.id}
                    className="relative border-l pl-4"
                    style={{
                      borderColor:
                        e.severidade === "critico"
                          ? "rgba(255,93,93,0.5)"
                          : e.severidade === "aviso"
                            ? "rgba(255,194,77,0.5)"
                            : "rgba(255,255,255,0.12)",
                    }}
                  >
                    <div className="text-sm text-white/80">{e.mensagem}</div>
                    <div className="rv-num mt-0.5 text-[11px] text-white/35">
                      {e.tipo.replace(/_/g, " ")} · {formatarDataHoraBR(e.criadoEm)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* administração */}
      {pode(perfil, "servidores.cadastrar") && servidor.status !== "revogado" ? (
        <div className="rv-entrar-3 mt-4">
          <form action={revogarServidor.bind(null, id)} className="flex flex-wrap items-center gap-3">
            <Btn type="submit" variante="perigo" tamanho="sm">
              <Ban className="size-3.5" /> Revogar servidor
            </Btn>
            <span className="text-xs text-white/35">
              O agente para de ser aceito. Reverta reinstalando com token novo.
            </span>
          </form>
        </div>
      ) : null}
    </>
  );
}
