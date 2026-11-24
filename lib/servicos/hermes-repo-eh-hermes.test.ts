/**
 * servidorEhHermes: quando uma rota do Credit recusa por o servidor ser Hermes, avisa no log
 * (só servidor_id e rota, sem segredos) para diagnosticar marcação errada. A resposta não muda.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ achou: false }));

vi.mock("drizzle-orm", () => ({ and: () => ({}), eq: () => ({}), like: () => ({}), lt: () => ({}), or: () => ({}), isNull: () => ({}), sql: () => ({}) }));
vi.mock("@/lib/db", () => {
  const t = (nome: string) => new Proxy({}, { get: (_o, k) => `${nome}.${String(k)}` });
  const cadeia = (): unknown => new Proxy(function () {}, { get: (_t, k) => (k === "then" ? (r: (x: unknown) => unknown) => r(estado.achou ? [{ id: "i" }] : []) : () => cadeia()) });
  return {
    db: { select: () => cadeia() },
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

beforeEach(() => {
  estado.achou = false;
});
afterEach(() => vi.restoreAllMocks());

describe("servidorEhHermes", () => {
  it("servidor Hermes recusado numa rota do Credit: console.warn com servidor_id e rota, resposta inalterada (true)", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    estado.achou = true;
    const { servidorEhHermes } = await import("./hermes-repo");
    expect(await servidorEhHermes(SERVIDOR, "heartbeat")).toBe(true);
    expect(aviso).toHaveBeenCalledTimes(1);
    const msg = String(aviso.mock.calls[0].join(" "));
    expect(msg).toContain(SERVIDOR);
    expect(msg).toContain("heartbeat");
  });

  it("servidor normal e consulta sem rota (ex.: emissão de lease) não geram aviso", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { servidorEhHermes } = await import("./hermes-repo");
    estado.achou = false;
    expect(await servidorEhHermes(SERVIDOR, "heartbeat")).toBe(false);
    estado.achou = true;
    expect(await servidorEhHermes(SERVIDOR)).toBe(true);
    expect(aviso).not.toHaveBeenCalled();
  });
});
