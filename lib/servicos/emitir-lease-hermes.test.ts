import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ hermes: false, selects: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({ and: () => ({}), eq: () => ({}) }));
vi.mock("@/lib/db", () => {
  const t = (nome: string) => new Proxy({}, { get: (_o, k) => `${nome}.${String(k)}` });
  const cadeia = (v: unknown): unknown => new Proxy(function () {}, { get: (_t, k) => (k === "then" ? (r: (x: unknown) => unknown) => r(v) : () => cadeia(v)) });
  return {
    db: {
      // ordem do Promise.all em emitirLease: 1º select = serviços licenciados; 2º = módulos do servidor
      select: () => cadeia(estado.selects++ % 2 === 0 ? [] : [{ licenca: true, picprice: true }]),
    },
    servidores: t("servidores"),
    servicoGerenciados: t("servicoGerenciados"),
  };
});
vi.mock("@/lib/servicos/hermes-repo", () => ({ servidorEhHermes: async () => estado.hermes }));
vi.mock("@/lib/config", () => ({ getConfig: async () => ({ modoSimulacao: false, modoPanico: false }) }));
vi.mock("@/lib/consultas/licencas", () => ({
  statusDeCliente: async () => ({ status: "ativa", operarAte: new Date("2099-01-01T00:00:00Z"), diasConfianca: 0 }),
}));
vi.mock("@/lib/crypto/lease", () => ({ assinarLease: (p: unknown) => ({ payload: JSON.stringify(p), assinatura: "a" }) }));

async function modulosDoLease() {
  const { emitirLease } = await import("./emitir-lease");
  const env = await emitirLease({ id: "11111111-1111-4111-8111-111111111111", clienteId: "c" });
  return (JSON.parse(env.payload) as { modulos: { licenca: boolean; picprice: boolean } }).modulos;
}

beforeEach(() => {
  estado.hermes = false;
  estado.selects = 0;
});

describe("emitirLease x servidor Hermes", () => {
  it("regressão: servidor normal com módulo Pic Price ligado segue com picprice=true", async () => {
    expect(await modulosDoLease()).toEqual({ licenca: true, picprice: true });
  });

  it("servidor Hermes nunca recebe o módulo Pic Price no lease, mesmo com a flag ligada no cadastro", async () => {
    estado.hermes = true;
    expect(await modulosDoLease()).toEqual({ licenca: true, picprice: false });
  });
});
