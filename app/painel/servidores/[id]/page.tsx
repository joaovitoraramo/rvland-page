import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowUpRight, Ban, Clock, Cpu, HardDrive, MemoryStick, Server, User } from "lucide-react";

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
  regenerarToken,
  revogarServidor,
} from "@/app/painel/servidores/actions";
import { PageHeader } from "@/components/painel/page-header";
import { BadgeServidor } from "@/components/painel/badge-servidor";
import { MonitorVivo } from "@/components/painel/monitor-vivo";
import { RevelarToken } from "@/components/painel/revelar-token";
import { HardwareCard } from "@/components/painel/hardware-card";
import { CardServicos } from "@/components/painel/card-servicos";
import { Btn } from "@/components/painel/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarDataHoraBR } from "@/lib/formato";

export const metadata = { title: "Servidor" };

function Medidor({ icone, rotulo, pct }: { icone: React.ReactNode; rotulo: string; pct: number | null }) {
  const cor = pct == null ? "#ffffff30" : pct >= 85 ? "#FF5D5D" : pct >= 60 ? "#FFC24D" : "#00FF8A";
  return (
    <div className="rounded-xl border border-white/8 bg-black/25 p-3 md:p-4">
      <div className="flex items-center gap-1.5 text-white/45 [&_svg]:size-3.5">
        {icone}
        <span className="rv-eyebrow">{rotulo}</span>
      </div>
      <div className="rv-num mt-2 text-xl font-semibold text-white md:text-2xl">
        {pct != null ? pct : "—"}
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

  const [[cliente], servicos, [tel], listaEventos, pendentes, statusCmds] = await Promise.all([
    db.select().from(clientes).where(eq(clientes.id, servidor.clienteId)),
    db
      .select()
      .from(servicoGerenciados)
      .where(eq(servicoGerenciados.servidorId, id))
      .orderBy(desc(servicoGerenciados.licenciado)),
    db.select().from(telemetriaAtual).where(eq(telemetriaAtual.servidorId, id)),
    db.select().from(eventos).where(eq(eventos.servidorId, id)).orderBy(desc(eventos.criadoEm)).limit(15),
    db
      .select({ id: comandos.id, verbo: comandos.verbo })
      .from(comandos)
      .where(and(eq(comandos.servidorId, id), eq(comandos.estado, "pendente")))
      .limit(20),
    // últimos snapshots de `systemctl status` concluídos
    db
      .select({
        servicoId: comandos.servicoId,
        resultado: comandos.resultado,
        concluidoEm: comandos.concluidoEm,
      })
      .from(comandos)
      .where(
        and(
          eq(comandos.servidorId, id),
          eq(comandos.verbo, "status"),
          eq(comandos.estado, "concluido")
        )
      )
      .orderBy(desc(comandos.concluidoEm))
      .limit(30),
  ]);

  // um snapshot por serviço (o mais recente)
  const snapshots = new Map<string, { texto: string; quando: Date } | undefined>();
  for (const c of statusCmds) {
    if (!c.servicoId || snapshots.has(c.servicoId)) continue;
    const texto = (c.resultado as { texto?: string } | null)?.texto;
    if (texto && c.concluidoEm) snapshots.set(c.servicoId, { texto, quando: c.concluidoEm });
  }

  const status = statusAgora({ status: servidor.status, ultimoContatoEm: servidor.ultimoContatoEm });
  const ativo = servidor.status === "ativo";
  const podeExecutar = pode(perfil, "servidores.executar") && ativo;
  const podeEditar = pode(perfil, "servidores.editar");

  const uptimeStr =
    tel?.uptimeSeg != null
      ? `${Math.floor(tel.uptimeSeg / 86400)}d ${Math.floor((tel.uptimeSeg % 86400) / 3600)}h`
      : null;

  return (
    <>
      <PageHeader
        trilha="servidores"
        titulo={servidor.nome}
        descricao={[servidor.host, servidor.hardware?.distro ?? servidor.so].filter(Boolean).join(" · ") || undefined}
        acoes={
          <>
            {ativo ? <MonitorVivo segundosIniciais={segundosDesde(servidor.ultimoContatoEm)} /> : null}
            <BadgeServidor status={status} />
            {servidor.agenteVersao ? (
              <span className="rv-eyebrow rounded-full border border-white/12 px-3 py-1.5">v{servidor.agenteVersao}</span>
            ) : null}
          </>
        }
      />

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
              <RevelarToken acao={regenerarToken.bind(null, id)} siteUrl={SITE_URL} jaPendente={servidor.status === "pendente"} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {ativo ? (
        <div className="rv-entrar-1 mb-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base text-white">
                Telemetria
                {uptimeStr ? <span className="rv-num text-xs font-normal text-white/40">uptime {uptimeStr}</span> : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <Medidor icone={<Cpu />} rotulo="cpu" pct={tel?.cpuPct ?? null} />
                <Medidor icone={<MemoryStick />} rotulo="memória" pct={tel?.memoriaPct ?? null} />
                <Medidor icone={<HardDrive />} rotulo="disco" pct={tel?.discoPct ?? null} />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {ativo ? (
        <div className="rv-entrar-2 mb-4">
          <HardwareCard hardware={servidor.hardware ?? null} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rv-entrar-2">
          <CardServicos
            servidorId={id}
            servicos={servicos}
            snapshots={snapshots}
            pendentes={pendentes}
            podeExecutar={podeExecutar}
            podeEditar={podeEditar}
            acaoServico={adicionarServico.bind(null, id)}
          />
        </div>

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

      {pode(perfil, "servidores.cadastrar") && servidor.status !== "revogado" ? (
        <div className="rv-entrar-3 mt-4">
          <form action={revogarServidor.bind(null, id)} className="flex flex-wrap items-center gap-3">
            <Btn type="submit" variante="perigo" tamanho="sm">
              <Ban className="size-3.5" /> Revogar servidor
            </Btn>
            <span className="text-xs text-white/35">O agente para de ser aceito. Reverta reinstalando com token novo.</span>
          </form>
        </div>
      ) : null}
    </>
  );
}
