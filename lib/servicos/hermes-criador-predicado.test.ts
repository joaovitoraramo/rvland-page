/**
 * Contrato dos DOIS pontos de SQL que decidem "servidor Hermes isolado" (`servidorEhHermes` em
 * hermes-repo.ts e `idsServidoresHermes` em hermes-painel-repo.ts): ambos filtram `criado_por` com o
 * MESMO padrão `LIKE` de origem-servidor.ts, ancorado em `chave:`. Aqui o `like` do drizzle é espião
 * (sem banco); o SQL real contra `painel:` está nos casos 5a/5b do script de integração do painel.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { criadoPorPainel, PADRAO_LIKE_CRIADOR_CHAVE } from "@/lib/hermes/origem-servidor";

const estado = vi.hoisted(() => ({ likes: [] as { coluna: unknown; padrao: unknown }[] }));

vi.mock("drizzle-orm", () => ({
  and: () => ({}),
  desc: () => ({}),
  eq: () => ({}),
  isNotNull: () => ({}),
  isNull: () => ({}),
  like: (coluna: unknown, padrao: unknown) => {
    estado.likes.push({ coluna, padrao });
    return {};
  },
  lt: () => ({}),
  or: () => ({}),
  sql: () => ({}),
}));
vi.mock("@/lib/db", () => {
  const t = (nome: string) => new Proxy({}, { get: (_o, k) => `${nome}.${String(k)}` });
  const cadeia = (): unknown => new Proxy(function () {}, { get: (_t, k) => (k === "then" ? (r: (x: unknown) => unknown) => r([]) : () => cadeia()) });
  return {
    db: { select: () => cadeia() },
    agenteReleases: t("agenteReleases"),
    clientes: t("clientes"),
    contratos: t("contratos"),
    eventos: t("eventos"),
    faturas: t("faturas"),
    hermesChaves: t("hermesChaves"),
    hermesInstalacoes: t("hermesInstalacoes"),
    hermesLicencas: t("hermesLicencas"),
    hermesLimites: t("hermesLimites"),
    servidores: t("servidores"),
  };
});

beforeEach(() => {
  estado.likes = [];
});

const doCriadoPor = () => estado.likes.filter((l) => l.coluna === "hermesInstalacoes.criadoPor");

describe("predicado `criado_por 'chave:%'` compartilhado", () => {
  it("servidorEhHermes filtra criado_por pelo padrão compartilhado", async () => {
    const { servidorEhHermes } = await import("./hermes-repo");
    await servidorEhHermes("11111111-1111-4111-8111-111111111111");
    expect(doCriadoPor()).toEqual([{ coluna: "hermesInstalacoes.criadoPor", padrao: PADRAO_LIKE_CRIADOR_CHAVE }]);
  });

  it("idsServidoresHermes filtra criado_por pelo MESMO padrão", async () => {
    const { idsServidoresHermes } = await import("./hermes-painel-repo");
    await idsServidoresHermes();
    expect(doCriadoPor()).toEqual([{ coluna: "hermesInstalacoes.criadoPor", padrao: PADRAO_LIKE_CRIADOR_CHAVE }]);
  });

  it("o padrão compartilhado é ancorado em `chave:` e não casa `painel:`", () => {
    expect(PADRAO_LIKE_CRIADOR_CHAVE.startsWith("chave:")).toBe(true);
    expect(PADRAO_LIKE_CRIADOR_CHAVE.startsWith("%")).toBe(false);
    expect(criadoPorPainel("chave:x").startsWith(PADRAO_LIKE_CRIADOR_CHAVE.replace(/%$/, ""))).toBe(false);
  });
});
