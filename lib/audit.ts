import "server-only";
import { db, auditoria } from "@/lib/db";
import type { PerfilSessao } from "@/lib/auth";

type Entidade =
  | "cliente"
  | "contrato"
  | "fatura"
  | "pagamento"
  | "licenca"
  | "grupo"
  | "usuario"
  | "plataforma"
  | "anexo"
  | "servidor"
  | "lead"
  | "prospeccao";

/**
 * Trilha de auditoria. Nunca lança: falha de auditoria não pode derrubar a
 * operação que está sendo auditada (mas fica no log do servidor).
 */
export async function registrarAuditoria(entrada: {
  ator: PerfilSessao | "sistema";
  acao: string;
  entidade: Entidade;
  entidadeId?: string;
  detalhes?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditoria).values({
      atorId: entrada.ator === "sistema" ? null : entrada.ator.id,
      atorNome: entrada.ator === "sistema" ? "sistema" : entrada.ator.nome,
      acao: entrada.acao,
      entidade: entrada.entidade,
      entidadeId: entrada.entidadeId ?? null,
      detalhes: entrada.detalhes ?? null,
    });
  } catch (err) {
    console.error("[auditoria] falha ao registrar:", entrada.acao, err);
  }
}
