/**
 * Isolamento Hermes x Credit/Pic Price: servidor criado pela ativação Hermes é tratado
 * como DESCONHECIDO (mesma resposta, sem revelar que existe) no heartbeat do Credit, em
 * picprice/autorizar, na consulta pública de licença e nos módulos do lease. O servidor
 * normal do Credit continua exatamente como antes (regressão).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assinar, gerarParEd25519 } from "@/lib/crypto/ed25519";
import { mensagemAssinada } from "@/lib/crypto/heartbeat-auth";

const SERVIDOR_ID = "11111111-1111-4111-8111-111111111111";
const CLIENTE_ID = "33333333-3333-4333-8333-333333333333";

const estado = vi.hoisted(() => ({
  servidor: null as null | Record<string, unknown>,
  hermes: false,
  selects: 0,
  escritas: 0,
  leaseChamado: 0,
  autorizacaoChamada: 0,
  modulosNoBanco: { licenca: true, picprice: true },
  rotasRecusa: [] as (string | undefined)[],
}));

// Cadeia thenable do drizzle: o 1º select devolve o servidor; os demais, [] (ou os módulos no lease).
function cadeia(resultado: unknown, escrita = false) {
  const p: unknown = new Proxy(function () {}, {
    get(_t, k) {
      if (k === "then") return (res: (v: unknown) => unknown) => res(resultado);
      return () => {
        if (escrita) estado.escritas++;
        return p;
      };
    },
    apply: () => p,
  });
  return p;
}

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({ and: () => ({}), eq: () => ({}), inArray: () => ({}), like: () => ({}), sql: () => ({}) }));
vi.mock("@/lib/db", () => {
  const t = (nome: string) => new Proxy({}, { get: (_o, k) => `${nome}.${String(k)}` });
  return {
    db: {
      select: () => cadeia(estado.selects++ === 0 ? (estado.servidor ? [estado.servidor] : []) : []),
      insert: () => cadeia(undefined, true),
      update: () => cadeia(undefined, true),
    },
    servidores: t("servidores"),
    servicoGerenciados: t("servicoGerenciados"),
    telemetriaAtual: t("telemetriaAtual"),
    telemetriaHistorico: t("telemetriaHistorico"),
    eventos: t("eventos"),
    comandos: t("comandos"),
  };
});
vi.mock("@/lib/servicos/hermes-repo", () => ({
  servidorEhHermes: async (_id: string, rota?: string) => {
    estado.rotasRecusa.push(rota);
    return estado.hermes;
  },
}));
vi.mock("@/lib/servicos/releases", () => ({ ultimaVersaoEstavel: async () => "1.2.3" }));
vi.mock("@/lib/servicos/emitir-lease", () => ({
  emitirLease: async () => {
    estado.leaseChamado++;
    return { payload: "p", assinatura: "a" };
  },
}));
vi.mock("@/lib/crypto/lease", () => ({ assinarEnvelope: () => ({ payload: "p", assinatura: "a" }) }));
vi.mock("@/lib/picprice/servidor", () => ({ depsBanco: {} }));
vi.mock("@/lib/picprice/autorizacao", () => ({
  tratarAutorizacao: async () => {
    estado.autorizacaoChamada++;
    return { status: 200, corpo: { estado: "OK" } };
  },
}));
vi.mock("@/lib/config", () => ({ getConfig: async () => ({ modoSimulacao: false, modoPanico: false }) }));
vi.mock("@/lib/consultas/licencas", () => ({
  statusDeCliente: async () => ({ status: "ativa", operarAte: new Date("2099-01-01T00:00:00Z"), diasConfianca: 0 }),
}));

const agente = gerarParEd25519();

function pedido(url: string, corpo: string, over: { servidor?: string; assinatura?: string } = {}) {
  const ts = new Date().toISOString();
  return new Request(`http://t${url}`, {
    method: "POST",
    body: corpo,
    headers: {
      "x-rvland-servidor": over.servidor ?? SERVIDOR_ID,
      "x-rvland-timestamp": ts,
      "x-rvland-assinatura": over.assinatura ?? assinar(mensagemAssinada(ts, corpo), agente.privadaB64),
    },
  });
}
const servidorNoBanco = () => ({
  id: SERVIDOR_ID,
  clienteId: CLIENTE_ID,
  status: "ativo",
  agentePubkey: agente.publicaB64,
  versaoAlvo: null,
  agenteVersao: "0.5.0",
  moduloPicprice: true,
});
const lerJson = async (r: Response) => ({ status: r.status, corpo: await r.json() });

beforeEach(() => {
  estado.servidor = servidorNoBanco();
  estado.hermes = false;
  estado.selects = 0;
  estado.escritas = 0;
  estado.leaseChamado = 0;
  estado.autorizacaoChamada = 0;
  estado.modulosNoBanco = { licenca: true, picprice: true };
  estado.rotasRecusa = [];
});

describe("diagnóstico: cada rota do Credit informa o nome ao verificar o servidor Hermes", () => {
  it("heartbeat, picprice/autorizar e licenca passam a rota para o aviso de log", async () => {
    const hb = await import("@/app/api/agente/heartbeat/route");
    await hb.POST(pedido("/api/agente/heartbeat", "{}"));
    estado.selects = 0;
    const pp = await import("@/app/api/agente/picprice/autorizar/route");
    await pp.POST(pedido("/api/agente/picprice/autorizar", "{}"));
    estado.selects = 0;
    const lic = await import("@/app/api/licenca/[servidor]/route");
    await lic.GET(new Request("http://t/api/licenca/x"), { params: Promise.resolve({ servidor: SERVIDOR_ID }) });
    expect(estado.rotasRecusa).toEqual(expect.arrayContaining(["heartbeat", "picprice/autorizar", "licenca"]));
  });
});

describe("heartbeat do Credit", () => {
  it("regressão: servidor normal do Credit segue 200 com lease, comandos e intervalo", async () => {
    const { POST } = await import("@/app/api/agente/heartbeat/route");
    const r = await lerJson(await POST(pedido("/api/agente/heartbeat", "{}")));
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ licenca: { payload: "p", assinatura: "a" }, comandos: [], versao_alvo: "1.2.3", intervalo_seg: 60 });
    expect(estado.leaseChamado).toBe(1);
  });

  it("servidor Hermes: 401 IDÊNTICO ao de servidor desconhecido, sem gravar nada nem emitir lease", async () => {
    const { POST } = await import("@/app/api/agente/heartbeat/route");
    estado.servidor = null; // desconhecido
    const desconhecido = await lerJson(await POST(pedido("/api/agente/heartbeat", "{}")));
    estado.selects = 0;
    estado.servidor = servidorNoBanco();
    estado.hermes = true;
    const hermes = await lerJson(await POST(pedido("/api/agente/heartbeat", "{}")));
    expect(hermes.status).toBe(401);
    expect(hermes).toEqual(desconhecido);
    expect(estado.escritas).toBe(0);
    expect(estado.leaseChamado).toBe(0);
  });

  it("servidor Hermes com assinatura errada recebe a MESMA 401 (sem oráculo de assinatura)", async () => {
    const { POST } = await import("@/app/api/agente/heartbeat/route");
    estado.hermes = true;
    const ruim = await lerJson(await POST(pedido("/api/agente/heartbeat", "{}", { assinatura: "AAAA" })));
    const bom = await lerJson(await POST(pedido("/api/agente/heartbeat", "{}")));
    expect(ruim.status).toBe(401);
    expect(ruim).toEqual(bom);
  });
});

describe("picprice/autorizar", () => {
  const corpo = JSON.stringify({ token: "rvpp_x", gtin: "7891000100103", lojas: [], raio: 1, data: "2026-11-23" });

  it("regressão: servidor normal chega a tratarAutorizacao e devolve o resultado", async () => {
    const { POST } = await import("@/app/api/agente/picprice/autorizar/route");
    const r = await lerJson(await POST(pedido("/api/agente/picprice/autorizar", corpo)));
    expect(r).toEqual({ status: 200, corpo: { estado: "OK" } });
    expect(estado.autorizacaoChamada).toBe(1);
  });

  it("servidor Hermes: 401 AGENTE_NAO_AUTENTICADO IDÊNTICO ao de desconhecido; nunca chega à autorização", async () => {
    const { POST } = await import("@/app/api/agente/picprice/autorizar/route");
    estado.servidor = null;
    const desconhecido = await lerJson(await POST(pedido("/api/agente/picprice/autorizar", corpo)));
    estado.selects = 0;
    estado.servidor = servidorNoBanco();
    estado.hermes = true;
    const hermes = await lerJson(await POST(pedido("/api/agente/picprice/autorizar", corpo)));
    expect(hermes.status).toBe(401);
    expect(hermes).toEqual(desconhecido);
    expect(estado.autorizacaoChamada).toBe(0);
  });
});

describe("consulta pública de licença /api/licenca/[servidor]", () => {
  const chamar = async () => {
    const { GET } = await import("@/app/api/licenca/[servidor]/route");
    return lerJson(await GET(new Request("http://t/api/licenca/x"), { params: Promise.resolve({ servidor: SERVIDOR_ID }) }));
  };

  it("regressão: servidor normal ativo segue 200", async () => {
    expect((await chamar()).status).toBe(200);
  });

  it("servidor Hermes: 404 idêntico ao de servidor inexistente", async () => {
    estado.servidor = null;
    const desconhecido = await chamar();
    estado.selects = 0;
    estado.servidor = servidorNoBanco();
    estado.hermes = true;
    const hermes = await chamar();
    expect(desconhecido.status).toBe(404);
    expect(hermes).toEqual(desconhecido);
  });
});
