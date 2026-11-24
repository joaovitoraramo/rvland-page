import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  hermes: false,
  statusChamado: 0,
  servicos: [] as { unidade: string }[],
  status: "ativa" as string,
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({ and: () => ({}), eq: () => ({}) }));
vi.mock("@/lib/db", () => {
  const t = (nome: string) => new Proxy({}, { get: (_o, k) => `${nome}.${String(k)}` });
  const cadeia = (v: unknown): unknown => new Proxy(function () {}, { get: (_t, k) => (k === "then" ? (r: (x: unknown) => unknown) => r(v) : () => cadeia(v)) });
  return {
    db: {
      // select({ unidade }) = serviços licenciados; select({ licenca, picprice }) = módulos do servidor
      select: (cols: Record<string, unknown>) => cadeia("unidade" in cols ? estado.servicos : [{ licenca: true, picprice: true }]),
    },
    servidores: t("servidores"),
    servicoGerenciados: t("servicoGerenciados"),
  };
});
vi.mock("@/lib/servicos/hermes-repo", () => ({ servidorEhHermes: async () => estado.hermes }));
vi.mock("@/lib/config", () => ({ getConfig: async () => ({ modoSimulacao: false, modoPanico: false }) }));
vi.mock("@/lib/consultas/licencas", () => ({
  statusDeCliente: async () => {
    estado.statusChamado++;
    return { status: estado.status, venceEm: null, toleradoAte: null };
  },
}));
vi.mock("@/lib/crypto/lease", () => ({ assinarLease: (p: unknown) => ({ payload: JSON.stringify(p), assinatura: "a" }) }));

type PayloadLease = { modulos: { licenca: boolean; picprice: boolean }; status: string; servicos_licenciados: string[] };

async function leaseEmitido() {
  const { emitirLease } = await import("./emitir-lease");
  const env = await emitirLease({ id: "11111111-1111-4111-8111-111111111111", clienteId: "c" });
  return JSON.parse(env.payload) as PayloadLease;
}
const modulosDoLease = async () => (await leaseEmitido()).modulos;

beforeEach(() => {
  estado.hermes = false;
  estado.statusChamado = 0;
  estado.servicos = [];
  estado.status = "ativa";
});

describe("emitirLease x servidor Hermes", () => {
  it("regressão: servidor normal com módulo Pic Price ligado segue com picprice=true", async () => {
    expect(await modulosDoLease()).toEqual({ licenca: true, picprice: true });
  });

  it("servidor Hermes nunca recebe nada do Credit: licenca=false, picprice=false, sem serviços e sem o status do cliente", async () => {
    estado.hermes = true;
    estado.status = "bloqueado"; // o cliente tem Credit bloqueado: não pode vazar para o lease Hermes
    estado.servicos = [{ unidade: "app.service" }];
    const lease = await leaseEmitido();
    expect(lease.modulos).toEqual({ licenca: false, picprice: false });
    expect(lease.servicos_licenciados).toEqual([]);
    expect(lease.status).toBe("sem_licenca");
  });

  it("regressão: servidor Credit normal mantém status do cliente, serviços licenciados e módulos do cadastro", async () => {
    estado.status = "bloqueado";
    estado.servicos = [{ unidade: "app.service" }];
    const lease = await leaseEmitido();
    expect(lease.modulos).toEqual({ licenca: true, picprice: true });
    expect(lease.servicos_licenciados).toEqual(["app.service"]);
    expect(lease.status).toBe("bloqueado");
    expect(estado.statusChamado).toBe(1);
  });
});
