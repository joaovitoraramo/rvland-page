import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  db,
  servidores,
  servicoGerenciados,
  telemetriaAtual,
  telemetriaHistorico,
  eventos,
  comandos,
} from "@/lib/db";
import { verificarHeartbeat } from "@/lib/crypto/heartbeat-auth";
import { emitirLease } from "@/lib/servicos/emitir-lease";
import { ultimaVersaoEstavel } from "@/lib/servicos/releases";

export const dynamic = "force-dynamic";

const INTERVALO_SEG = 60;

const esquema = z.object({
  agente_versao: z.string().nullish(),
  uptime_seg: z.number().int().nonnegative().nullish(),
  telemetria: z
    .object({
      cpu_pct: z.number().nullish(),
      memoria_pct: z.number().nullish(),
      disco_pct: z.number().nullish(),
      carga1: z.number().nullish(),
    })
    .partial()
    .nullish(),
  hardware: z
    .object({
      distro: z.string().nullish(),
      kernel: z.string().nullish(),
      cpu_modelo: z.string().nullish(),
      cpu_nucleos: z.number().nullish(),
      ram_total_mb: z.number().nullish(),
      discos: z
        .array(
          z.object({
            montagem: z.string(),
            dispositivo: z.string(),
            fs: z.string(),
            total_gb: z.number(),
            usado_pct: z.number(),
          })
        )
        .nullish(),
    })
    .nullish(),
  servicos: z.array(z.object({ unidade: z.string(), ativo: z.boolean() })).nullish(),
  eventos: z
    .array(
      z.object({
        tipo: z.string(),
        severidade: z.enum(["info", "aviso", "critico"]).nullish(),
        mensagem: z.string(),
        dados: z.record(z.string(), z.unknown()).nullish(),
      })
    )
    .nullish(),
  resultados_comandos: z
    .array(
      z.object({
        id: z.string().uuid(),
        estado: z.enum(["concluido", "falhou"]),
        saida: z.record(z.string(), z.unknown()).nullish(),
      })
    )
    .nullish(),
});

const TIPOS_EVENTO = new Set([
  "servico_caiu",
  "disco_alto",
  "reboot",
  "ssh_login",
  "agente_online",
  "agente_offline",
  "update_aplicado",
  "update_falhou",
]);

function inteiro(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
}

export async function POST(req: Request) {
  const servidorId = req.headers.get("x-rvland-servidor") ?? "";
  const timestamp = req.headers.get("x-rvland-timestamp") ?? "";
  const assinatura = req.headers.get("x-rvland-assinatura") ?? "";

  const rawBody = await req.text();

  const [servidor] = await db
    .select()
    .from(servidores)
    .where(and(eq(servidores.id, servidorId), eq(servidores.status, "ativo")))
    .limit(1);

  if (!servidor || !servidor.agentePubkey) {
    return NextResponse.json({ erro: "servidor desconhecido" }, { status: 401 });
  }

  const autentico = verificarHeartbeat({
    pubkeyB64: servidor.agentePubkey,
    timestamp,
    rawBody,
    assinaturaB64: assinatura,
  });
  if (!autentico) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  const dados = esquema.safeParse(JSON.parse(rawBody || "{}"));
  if (!dados.success) return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  const b = dados.data;
  const agora = new Date();

  // Telemetria: estado atual sobrescrito + snapshot no histórico
  const t = b.telemetria ?? {};
  await db
    .insert(telemetriaAtual)
    .values({
      servidorId: servidor.id,
      cpuPct: inteiro(t.cpu_pct),
      memoriaPct: inteiro(t.memoria_pct),
      discoPct: inteiro(t.disco_pct),
      carga1: inteiro(t.carga1),
      uptimeSeg: b.uptime_seg ?? null,
      payload: t,
      coletadoEm: agora,
    })
    .onConflictDoUpdate({
      target: telemetriaAtual.servidorId,
      set: {
        cpuPct: inteiro(t.cpu_pct),
        memoriaPct: inteiro(t.memoria_pct),
        discoPct: inteiro(t.disco_pct),
        carga1: inteiro(t.carga1),
        uptimeSeg: b.uptime_seg ?? null,
        payload: t,
        coletadoEm: agora,
      },
    });

  if (t.cpu_pct != null || t.memoria_pct != null || t.disco_pct != null) {
    await db.insert(telemetriaHistorico).values({
      servidorId: servidor.id,
      cpuPct: inteiro(t.cpu_pct),
      memoriaPct: inteiro(t.memoria_pct),
      discoPct: inteiro(t.disco_pct),
      coletadoEm: agora,
    });
  }

  // Status dos serviços reportados
  for (const s of b.servicos ?? []) {
    await db
      .update(servicoGerenciados)
      .set({ statusReportado: s.ativo ? "ativo" : "inativo", atualizadoEm: agora })
      .where(
        and(
          eq(servicoGerenciados.servidorId, servidor.id),
          eq(servicoGerenciados.unidadeSystemd, s.unidade)
        )
      );
  }

  // Eventos reportados (só tipos conhecidos)
  for (const e of b.eventos ?? []) {
    if (!TIPOS_EVENTO.has(e.tipo)) continue;
    await db.insert(eventos).values({
      servidorId: servidor.id,
      tipo: e.tipo as (typeof eventos.$inferInsert)["tipo"],
      severidade: e.severidade ?? "info",
      mensagem: e.mensagem,
      dados: e.dados ?? null,
    });
  }

  // Resultados de comandos
  for (const r of b.resultados_comandos ?? []) {
    await db
      .update(comandos)
      .set({ estado: r.estado, resultado: r.saida ?? null, concluidoEm: agora })
      .where(and(eq(comandos.id, r.id), eq(comandos.servidorId, servidor.id)));
  }

  await db
    .update(servidores)
    .set({
      ultimoContatoEm: agora,
      agenteVersao: b.agente_versao ?? servidor.agenteVersao,
      ...(b.hardware
        ? {
            hardware: {
              distro: b.hardware.distro ?? undefined,
              kernel: b.hardware.kernel ?? undefined,
              cpu_modelo: b.hardware.cpu_modelo ?? undefined,
              cpu_nucleos: b.hardware.cpu_nucleos ?? undefined,
              ram_total_mb: b.hardware.ram_total_mb ?? undefined,
              discos: b.hardware.discos ?? undefined,
            },
          }
        : {}),
    })
    .where(eq(servidores.id, servidor.id));

  // Comandos pendentes → marca enviado e devolve
  const pendentes = await db
    .select({
      id: comandos.id,
      verbo: comandos.verbo,
      servicoId: comandos.servicoId,
    })
    .from(comandos)
    .where(and(eq(comandos.servidorId, servidor.id), eq(comandos.estado, "pendente")));

  const idsServico = pendentes.map((p) => p.servicoId).filter(Boolean) as string[];
  const unidades = idsServico.length
    ? new Map(
        (
          await db
            .select({ id: servicoGerenciados.id, unidade: servicoGerenciados.unidadeSystemd })
            .from(servicoGerenciados)
            .where(inArray(servicoGerenciados.id, idsServico))
        ).map((s) => [s.id, s.unidade])
      )
    : new Map<string, string>();

  if (pendentes.length) {
    await db
      .update(comandos)
      .set({ estado: "enviado" })
      .where(
        and(
          eq(comandos.servidorId, servidor.id),
          inArray(
            comandos.id,
            pendentes.map((p) => p.id)
          )
        )
      );
  }

  const [licenca, versaoAlvo] = await Promise.all([
    emitirLease({ id: servidor.id, clienteId: servidor.clienteId }),
    // pin do servidor tem prioridade; senão, a última estável (auto-update)
    servidor.versaoAlvo ? Promise.resolve(servidor.versaoAlvo) : ultimaVersaoEstavel(),
  ]);

  return NextResponse.json({
    licenca,
    comandos: pendentes.map((p) => ({
      id: p.id,
      verbo: p.verbo,
      servico_unidade: p.servicoId ? (unidades.get(p.servicoId) ?? null) : null,
    })),
    versao_alvo: versaoAlvo,
    intervalo_seg: INTERVALO_SEG,
  });
}
