import "server-only";
import { desc, eq } from "drizzle-orm";

import { db, servidores, clientes, telemetriaAtual } from "@/lib/db";
import { statusServidor, type StatusServidor } from "@/lib/dominio/servidor";

/**
 * Status "agora" — lê o relógio aqui (módulo server-only) e não no render,
 * onde o React Compiler proíbe funções impuras como Date.now().
 */
export function statusAgora(s: {
  status: "pendente" | "ativo" | "revogado";
  ultimoContatoEm: Date | null;
}): StatusServidor {
  return statusServidor(s, Date.now());
}

/** Segundos desde uma data (lido aqui, fora do render). Null se ausente. */
export function segundosDesde(d: Date | null): number | null {
  if (!d) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
}

export type LinhaServidor = {
  id: string;
  nome: string;
  clienteNome: string;
  host: string | null;
  agenteVersao: string | null;
  ultimoContatoEm: Date | null;
  status: StatusServidor;
  cpuPct: number | null;
  discoPct: number | null;
};

export async function listarServidores(): Promise<LinhaServidor[]> {
  const linhas = await db
    .select({
      id: servidores.id,
      nome: servidores.nome,
      clienteNome: clientes.nome,
      host: servidores.host,
      statusBruto: servidores.status,
      agenteVersao: servidores.agenteVersao,
      ultimoContatoEm: servidores.ultimoContatoEm,
      cpuPct: telemetriaAtual.cpuPct,
      discoPct: telemetriaAtual.discoPct,
    })
    .from(servidores)
    .innerJoin(clientes, eq(clientes.id, servidores.clienteId))
    .leftJoin(telemetriaAtual, eq(telemetriaAtual.servidorId, servidores.id))
    .orderBy(desc(servidores.criadoEm));

  const agora = Date.now();
  const ordem: Record<StatusServidor, number> = {
    offline: 0,
    pendente: 1,
    online: 2,
    revogado: 3,
  };

  return linhas
    .map((l) => ({
      id: l.id,
      nome: l.nome,
      clienteNome: l.clienteNome,
      host: l.host,
      agenteVersao: l.agenteVersao,
      ultimoContatoEm: l.ultimoContatoEm,
      status: statusServidor({ status: l.statusBruto, ultimoContatoEm: l.ultimoContatoEm }, agora),
      cpuPct: l.cpuPct,
      discoPct: l.discoPct,
    }))
    .sort((a, b) => ordem[a.status] - ordem[b.status] || a.nome.localeCompare(b.nome));
}
