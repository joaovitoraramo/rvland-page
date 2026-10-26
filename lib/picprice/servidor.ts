import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";

import { db, clientes, picpriceCache, picpriceTokens, configuracoes } from "@/lib/db";
import { setConfig } from "@/lib/config";
import type { DepsPicPrice, StatusServico, ValidacaoToken } from "./api";

const CHAVE_STATUS = "picprice_status";

export function hashTokenPicPrice(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Token novo: "rvpp_" + 32 bytes aleatórios (base64url). Mostrado uma única vez. */
export function novoTokenPicPrice(): string {
  return "rvpp_" + randomBytes(32).toString("base64url");
}

export const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

// ── Status do serviço (configurável no painel) ──────────────────────────────

export async function getStatusServico(): Promise<StatusServico> {
  const [linha] = await db.select().from(configuracoes).where(eq(configuracoes.chave, CHAVE_STATUS));
  const v = (linha?.valor ?? {}) as Partial<StatusServico>;
  return {
    estado: v.estado === "manutencao" ? "manutencao" : "operante",
    mensagem: v.mensagem ?? null,
    previsao: v.previsao ?? null,
  };
}

export async function setStatusServico(s: StatusServico): Promise<void> {
  await setConfig(CHAVE_STATUS, { estado: s.estado, mensagem: s.mensagem ?? null, previsao: s.previsao ?? null });
}

// ── Tokens ──────────────────────────────────────────────────────────────────

export async function validarTokenPicPrice(token: string): Promise<ValidacaoToken> {
  const [t] = await db
    .select({ id: picpriceTokens.id, clienteId: picpriceTokens.clienteId, status: picpriceTokens.status, expiraEm: picpriceTokens.expiraEm, verEstabelecimento: picpriceTokens.verEstabelecimento })
    .from(picpriceTokens)
    .where(eq(picpriceTokens.tokenHash, hashTokenPicPrice(token)))
    .limit(1);
  if (!t) return { ok: false, motivo: "inexistente" };
  if (t.status !== "ativo") return { ok: false, motivo: "revogado" };
  if (t.expiraEm && t.expiraEm.getTime() <= Date.now()) return { ok: false, motivo: "expirado" };
  return { ok: true, clienteId: t.clienteId, tokenId: t.id, verEstabelecimento: t.verEstabelecimento };
}

/** Gera (ou troca) o token do cliente. Um por cliente: trocar invalida o anterior. */
export async function gerarTokenDoCliente(clienteId: string, expiraEm: Date | null = null): Promise<{ token: string; cnpj: string }> {
  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, clienteId)).limit(1);
  if (!cliente) throw new Error("Cliente não encontrado.");
  const cnpj = soDigitos(cliente.documento);
  if (cnpj.length !== 14) throw new Error("O cliente precisa ter o CNPJ completo da matriz no cadastro.");
  const token = novoTokenPicPrice();
  const valores = {
    cnpj,
    tokenHash: hashTokenPicPrice(token),
    prefixo: token.slice(0, 10),
    status: "ativo" as const,
    criadoEm: new Date(),
    revogadoEm: null,
    ultimoUsoEm: null,
    expiraEm,
  };
  await db
    .insert(picpriceTokens)
    .values({ clienteId, ...valores })
    .onConflictDoUpdate({ target: picpriceTokens.clienteId, set: valores });
  return { token, cnpj };
}

/** Validade do token do cliente (NULL = não expira). Estende/altera sem trocar o token. Devolve a anterior. */
export async function definirValidadeToken(clienteId: string, expiraEm: Date | null): Promise<{ anterior: Date | null }> {
  const [atual] = await db
    .select({ exp: picpriceTokens.expiraEm })
    .from(picpriceTokens)
    .where(eq(picpriceTokens.clienteId, clienteId))
    .limit(1);
  if (!atual) throw new Error("O cliente ainda não tem token.");
  await db.update(picpriceTokens).set({ expiraEm }).where(eq(picpriceTokens.clienteId, clienteId));
  return { anterior: atual.exp };
}

/** Permite (ou não) o agente devolver o nome do estabelecimento no ranking. Devolve o anterior. */
export async function definirVerEstabelecimento(clienteId: string, ver: boolean): Promise<{ anterior: boolean }> {
  const [atual] = await db
    .select({ ver: picpriceTokens.verEstabelecimento })
    .from(picpriceTokens)
    .where(eq(picpriceTokens.clienteId, clienteId))
    .limit(1);
  if (!atual) throw new Error("O cliente ainda não tem token.");
  await db.update(picpriceTokens).set({ verEstabelecimento: ver }).where(eq(picpriceTokens.clienteId, clienteId));
  return { anterior: atual.ver };
}

/** Limite diário de requisições do token do cliente (inteiro ≥ 1). Devolve o anterior. */
export async function definirLimiteDiario(clienteId: string, limite: number): Promise<{ anterior: number | null }> {
  const [atual] = await db
    .select({ limite: picpriceTokens.limiteDiario })
    .from(picpriceTokens)
    .where(eq(picpriceTokens.clienteId, clienteId))
    .limit(1);
  if (!atual) throw new Error("O cliente ainda não tem token.");
  await db.update(picpriceTokens).set({ limiteDiario: limite }).where(eq(picpriceTokens.clienteId, clienteId));
  return { anterior: atual.limite };
}

/**
 * Conta 1 requisição no dia, num único UPDATE (atômico com chamadas simultâneas):
 * dia novo recomeça em 1; mesmo dia soma só se ainda couber. Sem linha = estourou.
 */
export async function consumirCotaPicPrice(tokenId: string, dia: string) {
  const [l] = await db
    .update(picpriceTokens)
    .set({
      usoQtde: sql`CASE WHEN ${picpriceTokens.usoDia} = ${dia}::date THEN ${picpriceTokens.usoQtde} + 1 ELSE 1 END`,
      usoDia: dia,
      ultimoUsoEm: new Date(),
    })
    .where(
      and(
        eq(picpriceTokens.id, tokenId),
        sql`(${picpriceTokens.usoDia} IS DISTINCT FROM ${dia}::date OR ${picpriceTokens.usoQtde} < ${picpriceTokens.limiteDiario})`
      )
    )
    .returning({ usado: picpriceTokens.usoQtde, limite: picpriceTokens.limiteDiario });
  if (l) return { ok: true, usado: l.usado, limite: l.limite };
  const lido = await lerCotaPicPrice(tokenId, dia);
  return { ok: false, ...lido };
}

export async function lerCotaPicPrice(tokenId: string, dia: string) {
  const [t] = await db
    .select({ dia: picpriceTokens.usoDia, qtde: picpriceTokens.usoQtde, limite: picpriceTokens.limiteDiario })
    .from(picpriceTokens)
    .where(eq(picpriceTokens.id, tokenId))
    .limit(1);
  return { usado: t && t.dia === dia ? t.qtde : 0, limite: t?.limite ?? 200 };
}

export async function mudarStatusToken(clienteId: string, status: "ativo" | "revogado"): Promise<void> {
  await db
    .update(picpriceTokens)
    .set({ status, revogadoEm: status === "revogado" ? new Date() : null })
    .where(eq(picpriceTokens.clienteId, clienteId));
}

export async function listarTokensPicPrice() {
  return db
    .select({
      clienteId: clientes.id,
      cliente: clientes.nome,
      documento: clientes.documento,
      tokenId: picpriceTokens.id,
      cnpj: picpriceTokens.cnpj,
      prefixo: picpriceTokens.prefixo,
      status: picpriceTokens.status,
      criadoEm: picpriceTokens.criadoEm,
      revogadoEm: picpriceTokens.revogadoEm,
      ultimoUsoEm: picpriceTokens.ultimoUsoEm,
      limiteDiario: picpriceTokens.limiteDiario,
      usoDia: picpriceTokens.usoDia,
      usoQtde: picpriceTokens.usoQtde,
      expiraEm: picpriceTokens.expiraEm,
      verEstabelecimento: picpriceTokens.verEstabelecimento,
    })
    .from(clientes)
    .leftJoin(picpriceTokens, eq(picpriceTokens.clienteId, clientes.id))
    .where(eq(clientes.status, "ativo"))
    .orderBy(desc(picpriceTokens.ultimoUsoEm), clientes.nome);
}

// ── Dependências reais dos endpoints ────────────────────────────────────────

export const depsBanco: DepsPicPrice = {
  validarToken: validarTokenPicPrice,
  statusServico: getStatusServico,
  async cacheGet(chave) {
    const [l] = await db
      .select({ dados: picpriceCache.dados })
      .from(picpriceCache)
      .where(and(eq(picpriceCache.chave, chave), gt(picpriceCache.expiraEm, new Date())))
      .limit(1);
    return l?.dados ?? null;
  },
  async cacheSet(chave, dados, minutos) {
    const expiraEm = new Date(Date.now() + minutos * 60_000);
    await db
      .insert(picpriceCache)
      .values({ chave, dados, expiraEm })
      .onConflictDoUpdate({ target: picpriceCache.chave, set: { dados, expiraEm } });
    // faxina barata: de vez em quando apaga o que venceu
    if (Math.random() < 0.05) await db.delete(picpriceCache).where(lt(picpriceCache.expiraEm, new Date()));
  },
  consumirCota: consumirCotaPicPrice,
  lerCota: lerCotaPicPrice,
};
