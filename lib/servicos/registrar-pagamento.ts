import "server-only";
import { and, eq, ne } from "drizzle-orm";

import { db, faturas, licencas, pagamentos } from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
import { hojeSP } from "@/lib/dominio/tempo";
import type { PerfilSessao } from "@/lib/auth";

export type EntradaPagamento = {
  faturaId: string;
  valorCentavos: number;
  pagoEm: string; // AAAA-MM-DD
  forma?: string | null;
  notas?: string | null;
  criadoPor: string;
  ator: PerfilSessao | "sistema";
  detalhesExtras?: Record<string, unknown>;
};

export type ResultadoPagamento =
  | { ok: true; quitou: boolean; historica: boolean; clienteId: string; licencaRenovada: boolean }
  | { ok: false; erro: string };

/**
 * Núcleo compartilhado de pagamento (painel e bot do Telegram): insere o
 * pagamento, atualiza a fatura, audita e aplica a renovação automática de
 * licença quando o cliente fica sem vencidas. A regra vive SÓ aqui.
 */
export async function registrarPagamentoNaFatura(
  entrada: EntradaPagamento
): Promise<ResultadoPagamento> {
  const [fatura] = await db.select().from(faturas).where(eq(faturas.id, entrada.faturaId));
  if (!fatura) return { ok: false, erro: "Fatura não encontrada." };
  if (fatura.status === "cancelada") {
    return { ok: false, erro: "Fatura cancelada não recebe pagamento." };
  }
  if (fatura.status === "quitada") return { ok: false, erro: "Fatura já quitada." };

  await db.insert(pagamentos).values({
    faturaId: entrada.faturaId,
    valorCentavos: entrada.valorCentavos,
    pagoEm: entrada.pagoEm,
    forma: entrada.forma ?? null,
    notas: entrada.notas ?? null,
    criadoPor: entrada.criadoPor,
  });

  const totalPago = fatura.pagoCentavos + entrada.valorCentavos;
  const quitou = totalPago >= fatura.valorCentavos;

  await db
    .update(faturas)
    .set({
      pagoCentavos: totalPago,
      ...(quitou ? { status: "quitada" as const, quitadaEm: new Date() } : {}),
    })
    .where(eq(faturas.id, entrada.faturaId));

  await registrarAuditoria({
    ator: entrada.ator,
    acao: quitou ? "pagamento.confirmado" : "pagamento.parcial",
    entidade: "pagamento",
    entidadeId: entrada.faturaId,
    detalhes: {
      clienteId: fatura.clienteId,
      valorCentavos: entrada.valorCentavos,
      totalPago,
      valorFatura: fatura.valorCentavos,
      ...(entrada.detalhesExtras ?? {}),
    },
  });

  // Renovação automática: quitou e o cliente ficou sem vencidas não-históricas
  // → zera dias de confiança e audita a renovação. O status deriva sozinho;
  // o agente aplica no próximo heartbeat.
  let licencaRenovada = false;
  if (quitou && !fatura.historica) {
    const hoje = hojeSP();
    const abertasVencidas = (
      await db
        .select({ vencimento: faturas.vencimento, historica: faturas.historica })
        .from(faturas)
        .where(
          and(
            eq(faturas.clienteId, fatura.clienteId),
            eq(faturas.status, "aberta"),
            ne(faturas.id, entrada.faturaId)
          )
        )
    ).filter((f) => !f.historica && f.vencimento < hoje);

    if (abertasVencidas.length === 0) {
      await db
        .update(licencas)
        .set({ diasConfianca: 0, atualizadoEm: new Date() })
        .where(eq(licencas.clienteId, fatura.clienteId));

      await registrarAuditoria({
        ator: "sistema",
        acao: "licenca.renovada",
        entidade: "licenca",
        entidadeId: fatura.clienteId,
        detalhes: { faturaId: entrada.faturaId, motivo: "pagamento integral confirmado" },
      });
      licencaRenovada = true;
    }
  }

  return {
    ok: true,
    quitou,
    historica: fatura.historica,
    clienteId: fatura.clienteId,
    licencaRenovada,
  };
}
