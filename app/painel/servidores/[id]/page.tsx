import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { Cpu, HardDrive, MemoryStick, Play, Square, Activity, Trash2, Ban } from "lucide-react";

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
import { statusAgora } from "@/lib/consultas/servidores";
import {
  adicionarServico,
  enfileirarComando,
  regenerarToken,
  removerServico,
  revogarServidor,
} from "@/app/painel/servidores/actions";
import { PageHeader } from "@/components/painel/page-header";
import { BadgeServidor } from "@/components/painel/badge-servidor";
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
    <div className="rounded-xl border border-white/8 bg-black/25 p-3">
      <div className="flex items-center gap-2 text-white/45 [&_svg]:size-3.5">
        {icone}
        <span className="rv-eyebrow">{rotulo}</span>
      </div>
      <div className="rv-num mt-2 text-lg font-semibold text-white">{pct != null ? `${pct}%` : "—"}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct ?? 0}%`, background: cor }} />
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
    db
      .select()
      .from(eventos)
      .where(eq(eventos.servidorId, id))
      .orderBy(desc(eventos.criadoEm))
      .limit(15),
    db
      .select()
      .from(comandos)
      .where(and(eq(comandos.servidorId, id), eq(comandos.estado, "pendente")))
      .limit(20),
  ]);

  const status = statusAgora({
    status: servidor.status,
    ultimoContatoEm: servidor.ultimoContatoEm,
  });
  const podeExecutar = pode(perfil, "servidores.executar") && servidor.status === "ativo";
  const podeEditar = pode(perfil, "servidores.editar");

  const acaoRevelar = regenerarToken.bind(null, id);
  const acaoServico = adicionarServico.bind(null, id);

  return (
    <>
      <PageHeader
        trilha="servidores"
        titulo={servidor.nome}
        descricao={[cliente?.nome, servidor.host, servidor.so].filter(Boolean).join(" · ") || undefined}
        acoes={
          <>
            <BadgeServidor status={status} />
            {servidor.agenteVersao ? (
              <span className="rv-eyebrow rounded-full border border-white/12 px-3 py-1.5">
                v{servidor.agenteVersao}
              </span>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Coluna 1: instalação / telemetria */}
        <div className="rv-entrar-1 space-y-4">
          {servidor.status !== "ativo" && pode(perfil, "servidores.cadastrar") ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-white">Instalação do agente</CardTitle>
              </CardHeader>
              <CardContent>
                <RevelarToken acao={acaoRevelar} siteUrl={SITE_URL} jaPendente={servidor.status === "pendente"} />
              </CardContent>
            </Card>
          ) : null}

          {servidor.status === "ativo" ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base text-white">
                  Telemetria
                  <span className="rv-num text-xs font-normal text-white/40">
                    {tel?.coletadoEm ? formatarDataHoraBR(tel.coletadoEm) : "sem dados"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  <Medidor icone={<Cpu />} rotulo="cpu" pct={tel?.cpuPct ?? null} />
                  <Medidor icone={<MemoryStick />} rotulo="memória" pct={tel?.memoriaPct ?? null} />
                  <Medidor icone={<HardDrive />} rotulo="disco" pct={tel?.discoPct ?? null} />
                </div>
                {tel?.uptimeSeg != null ? (
                  <p className="rv-num mt-3 text-xs text-white/40">
                    uptime {Math.floor(tel.uptimeSeg / 86400)}d {Math.floor((tel.uptimeSeg % 86400) / 3600)}h
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {pode(perfil, "servidores.cadastrar") && servidor.status !== "revogado" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-white">Administração</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={revogarServidor.bind(null, id)}>
                  <Btn type="submit" variante="perigo" tamanho="sm">
                    <Ban className="size-3.5" /> Revogar servidor
                  </Btn>
                  <p className="mt-2 text-xs text-white/35">
                    O agente para de ser aceito. Reverta reinstalando com token novo.
                  </p>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Coluna 2: serviços */}
        <div className="rv-entrar-2 space-y-4">
          <Card>
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
                        <div className="text-sm font-medium text-white">{s.nome}</div>
                        <div className="rv-num truncate text-xs text-white/45">{s.unidadeSystemd}</div>
                      </div>
                      <span
                        className={`rv-eyebrow shrink-0 ${
                          s.statusReportado === "ativo"
                            ? "!text-[#7DFFC4]"
                            : s.statusReportado === "inativo"
                              ? "!text-[#FF9D9D]"
                              : "!text-white/35"
                        }`}
                      >
                        {s.statusReportado}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {s.licenciado ? (
                        <span className="rv-eyebrow rounded border border-[rgba(0,229,255,0.2)] px-1.5 py-0.5 !text-[#8AF0FF]">
                          licenciado
                        </span>
                      ) : null}
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
                            className="grid size-7 place-items-center rounded-lg text-white/30 hover:bg-white/5 hover:text-red-300"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))
              )}

              {podeEditar ? <FormServico acao={acaoServico} /> : null}
            </CardContent>
          </Card>

          {pendentes.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-white">Comandos na fila</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {pendentes.map((c) => (
                    <li key={c.id} className="flex items-center justify-between">
                      <span className="rv-num text-white/75">{c.verbo}</span>
                      <span className="rv-eyebrow">{c.criadoPor}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-white/35">Aplicados no próximo heartbeat do agente.</p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Coluna 3: eventos */}
        <div className="rv-entrar-3 space-y-4">
          <Card>
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

          <Card>
            <CardContent className="pt-5">
              <Link
                href={`/painel/clientes/${servidor.clienteId}`}
                className="text-sm text-[#8AF0FF] hover:underline"
              >
                Ver cliente: {cliente?.nome}
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
