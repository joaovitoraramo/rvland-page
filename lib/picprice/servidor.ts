import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, lt } from "drizzle-orm";

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
    .select({ id: picpriceTokens.id, clienteId: picpriceTokens.clienteId, status: picpriceTokens.status })
    .from(picpriceTokens)
    .where(eq(picpriceTokens.tokenHash, hashTokenPicPrice(token)))
    .limit(1);
  if (!t) return { ok: false, motivo: "inexistente" };
  if (t.status !== "ativo") return { ok: false, motivo: "revogado" };
  return { ok: true, clienteId: t.clienteId, tokenId: t.id };
}

/** Gera (ou troca) o token do cliente. Um por cliente: trocar invalida o anterior. */
export async function gerarTokenDoCliente(clienteId: string): Promise<{ token: string; cnpj: string }> {
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
  };
  await db
    .insert(picpriceTokens)
    .values({ clienteId, ...valores })
    .onConflictDoUpdate({ target: picpriceTokens.clienteId, set: valores });
  return { token, cnpj };
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
  async registrarUso(tokenId) {
    await db.update(picpriceTokens).set({ ultimoUsoEm: new Date() }).where(eq(picpriceTokens.id, tokenId));
  },
};
