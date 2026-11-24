/**
 * registrarContatoServidor: a versão do agente só entra no UPDATE quando preenchida. Ausente, nula ou
 * vazia NÃO zera `servidores.agente_versao` (mesma regra do heartbeat do Credit). Aqui o `db` é espião e
 * o que se prova é o objeto que o repositório REAL passa ao `.set()`; o efeito no SQL está no caso 5e de
 * scripts/testes-integracao-hermes-painel.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ sets: [] as Record<string, unknown>[], tabelas: [] as unknown[] }));

vi.mock("drizzle-orm", () => ({ and: () => ({}), eq: () => ({}), like: () => ({}), lt: () => ({}), or: () => ({}), isNull: () => ({}), sql: () => ({}) }));
vi.mock("@/lib/db", () => {
  const t = (nome: string) => new Proxy({}, { get: (_o, k) => `${nome}.${String(k)}` });
  return {
    db: {
      update: (tabela: unknown) => {
        estado.tabelas.push(tabela);
        return {
          set: (valores: Record<string, unknown>) => {
            estado.sets.push(valores);
            return { where: async () => undefined };
          },
        };
      },
    },
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

const SERVIDOR = "11111111-1111-4111-8111-111111111111";
const EM = new Date("2026-11-24T12:00:00.000Z");

beforeEach(() => {
  estado.sets = [];
  estado.tabelas = [];
});

describe("registrarContatoServidor (regra de agente_versao)", () => {
  it.each([["omitida", undefined], ["nula", null], ["vazia", ""]])("versão %s: atualiza só ultimo_contato_em, NÃO toca agente_versao", async (_n, versao) => {
    const { registrarContatoServidor } = await import("./hermes-repo");
    await registrarContatoServidor(SERVIDOR, EM, versao);
    expect(estado.tabelas).toHaveLength(1);
    expect(estado.sets).toEqual([{ ultimoContatoEm: EM }]);
    expect(estado.sets[0]).not.toHaveProperty("agenteVersao");
  });

  it("versão preenchida: grava ultimo_contato_em e agente_versao", async () => {
    const { registrarContatoServidor } = await import("./hermes-repo");
    await registrarContatoServidor(SERVIDOR, EM, "0.7.1");
    expect(estado.sets).toEqual([{ ultimoContatoEm: EM, agenteVersao: "0.7.1" }]);
  });
});
