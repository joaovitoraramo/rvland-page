import { describe, it, expect, beforeAll } from "vitest";
import { gerarParEd25519, assinar } from "./ed25519";
import { assinarLease } from "./lease";
import {
  assinarDocumentoHermes,
  verificarDocumentoHermes,
  type EnvelopeHermes,
} from "./hermes";
import { licencaHermes } from "@/lib/hermes/licenca";
import { montarDocumentoHermes, type DocumentoHermes } from "@/lib/hermes/documento";

let par: { publicaB64: string; privadaB64: string };
let outra: { publicaB64: string; privadaB64: string };
let doc: DocumentoHermes;

beforeAll(() => {
  par = gerarParEd25519();
  outra = gerarParEd25519();
  doc = montarDocumentoHermes({
    instalacaoId: "i-1",
    servidorId: "s-1",
    clienteId: "c-1",
    cnpj: "12345678000190",
    canal: "stable",
    enforcementAtivo: true,
    enforcementInstalacao: "herdar",
    licenca: licencaHermes({
      agora: new Date("2026-01-05T15:00:00.000Z"),
      instalacaoRevogada: false,
      bloqueioManual: false,
      independeFinanceiro: true,
      renovacaoDias: 30,
      diasConfianca: 0,
      modoPanico: false,
      contrato: null,
    }),
  });
});

const chaves = () => ({ h1: par.publicaB64 });
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o), "utf8").toString("base64");

describe("assinatura do documento Hermes", () => {
  it("assina e verifica, devolvendo o documento; envelope = {payload, assinatura, kid}", () => {
    const env = assinarDocumentoHermes(doc, par.privadaB64);
    expect(Object.keys(env).sort()).toEqual(["assinatura", "kid", "payload"]);
    expect(env.kid).toBe("h1");
    const r = verificarDocumentoHermes(env, chaves());
    expect(r).toEqual(doc);
  });

  it("rejeita payload adulterado", () => {
    const env = assinarDocumentoHermes(doc, par.privadaB64);
    const adulterado: EnvelopeHermes = {
      ...env,
      payload: b64({ ...doc, operar_ate: "2099-01-01T00:00:00.000Z" }),
    };
    expect(verificarDocumentoHermes(adulterado, chaves())).toBeNull();
  });

  it("rejeita assinatura de outra chave", () => {
    const env = assinarDocumentoHermes(doc, outra.privadaB64);
    expect(verificarDocumentoHermes(env, chaves())).toBeNull();
  });

  it("rejeita kid desconhecido", () => {
    const env = assinarDocumentoHermes(doc, par.privadaB64);
    expect(verificarDocumentoHermes({ ...env, kid: "h9" }, chaves())).toBeNull();
    expect(verificarDocumentoHermes(env, { h2: par.publicaB64 })).toBeNull();
  });

  it("rejeita kid do envelope diferente do kid dentro do payload", () => {
    const env = assinarDocumentoHermes(doc, par.privadaB64);
    expect(
      verificarDocumentoHermes({ ...env, kid: "h2" }, { h2: par.publicaB64 })
    ).toBeNull();
  });

  it("recusa envelope com tipo diferente de hermes_licenca, mesmo bem assinado pela mesma chave", () => {
    const payload = Buffer.from(JSON.stringify({ ...doc, tipo: "picprice_autorizacao" }), "utf8");
    const env: EnvelopeHermes = {
      payload: payload.toString("base64"),
      assinatura: assinar(payload, par.privadaB64),
      kid: "h1",
    };
    expect(verificarDocumentoHermes(env, chaves())).toBeNull();
  });

  it("recusa payload sem tipo (formato de lease/autorização) mesmo com assinatura válida", () => {
    const { tipo: _t, ...semTipo } = doc;
    void _t;
    const payload = Buffer.from(JSON.stringify(semTipo), "utf8");
    const env: EnvelopeHermes = {
      payload: payload.toString("base64"),
      assinatura: assinar(payload, par.privadaB64),
      kid: "h1",
    };
    expect(verificarDocumentoHermes(env, chaves())).toBeNull();
  });

  it("um lease assinado pela chave de licença nunca valida como documento Hermes", () => {
    const antesSK = process.env.RVLAND_LICENSE_SK;
    const antesPK = process.env.RVLAND_LICENSE_PK;
    let lease;
    try {
      process.env.RVLAND_LICENSE_SK = par.privadaB64;
      process.env.RVLAND_LICENSE_PK = par.publicaB64;
      lease = assinarLease({
        v: 1,
        servidor_id: "s-1",
        cliente_id: "c-1",
        emitido_em: "2026-01-05T15:00:00.000Z",
        status: "em_dia",
        operar_ate: "2099-01-01T00:00:00.000Z",
        renovar_apos: "2026-01-06T03:00:00.000Z",
        servicos_licenciados: [],
        modo_simulacao: false,
        panico: false,
        modulos: { licenca: true, picprice: false },
      });
    } finally {
      if (antesSK === undefined) delete process.env.RVLAND_LICENSE_SK;
      else process.env.RVLAND_LICENSE_SK = antesSK;
      if (antesPK === undefined) delete process.env.RVLAND_LICENSE_PK;
      else process.env.RVLAND_LICENSE_PK = antesPK;
    }
    // mesmo com a MESMA chave pública cadastrada para o kid h1
    expect(verificarDocumentoHermes({ ...lease, kid: "h1" }, chaves())).toBeNull();
  });

  it("recusa versão diferente de 1 (v: 2) mesmo bem assinada", () => {
    const payload = Buffer.from(JSON.stringify({ ...doc, v: 2 }), "utf8");
    const env: EnvelopeHermes = {
      payload: payload.toString("base64"),
      assinatura: assinar(payload, par.privadaB64),
      kid: "h1",
    };
    expect(verificarDocumentoHermes(env, chaves())).toBeNull();
  });

  it("kid herdado do protótipo (__proto__, toString, constructor) é recusado", () => {
    for (const kid of ["__proto__", "toString", "constructor", "hasOwnProperty"]) {
      const payload = Buffer.from(JSON.stringify({ ...doc, kid }), "utf8");
      const env: EnvelopeHermes = {
        payload: payload.toString("base64"),
        assinatura: assinar(payload, par.privadaB64),
        kid,
      };
      expect(verificarDocumentoHermes(env, chaves())).toBeNull();
    }
  });

  it("recusa assinar algo que não é documento hermes_licenca", () => {
    expect(() =>
      assinarDocumentoHermes({ ...doc, tipo: "outro" } as unknown as DocumentoHermes, par.privadaB64)
    ).toThrow();
  });

  it("envelopes malformados não lançam", () => {
    expect(verificarDocumentoHermes({ payload: "!!", assinatura: "x", kid: "h1" }, chaves())).toBeNull();
    expect(
      verificarDocumentoHermes(null as unknown as EnvelopeHermes, chaves())
    ).toBeNull();
  });

  it("lê as chaves de RVLAND_HERMES_SK/RVLAND_HERMES_PK do ambiente quando não passadas", async () => {
    const { assinarDocumentoHermesAmbiente, verificarDocumentoHermesAmbiente } = await import("./hermes");
    process.env.RVLAND_HERMES_SK = par.privadaB64;
    process.env.RVLAND_HERMES_PK = par.publicaB64;
    try {
      const env = assinarDocumentoHermesAmbiente(doc);
      expect(verificarDocumentoHermesAmbiente(env)).toEqual(doc);
    } finally {
      delete process.env.RVLAND_HERMES_SK;
      delete process.env.RVLAND_HERMES_PK;
    }
    expect(() => assinarDocumentoHermesAmbiente(doc)).toThrow(/RVLAND_HERMES_SK/);
  });

  it("recusa assinar se RVLAND_LICENSE_SK for a mesma chave da Hermes (separação de chaves)", async () => {
    const { assinarDocumentoHermesAmbiente } = await import("./hermes");
    const antesH = process.env.RVLAND_HERMES_SK;
    const antesL = process.env.RVLAND_LICENSE_SK;
    try {
      process.env.RVLAND_HERMES_SK = par.privadaB64;
      process.env.RVLAND_LICENSE_SK = par.privadaB64;
      expect(() => assinarDocumentoHermesAmbiente(doc)).toThrow(/RVLAND_LICENSE_SK/);
      // chaves distintas: tudo certo
      process.env.RVLAND_LICENSE_SK = outra.privadaB64;
      expect(assinarDocumentoHermesAmbiente(doc).kid).toBe("h1");
      // sem RVLAND_LICENSE_SK no ambiente: tudo certo
      delete process.env.RVLAND_LICENSE_SK;
      expect(assinarDocumentoHermesAmbiente(doc).kid).toBe("h1");
    } finally {
      if (antesH === undefined) delete process.env.RVLAND_HERMES_SK;
      else process.env.RVLAND_HERMES_SK = antesH;
      if (antesL === undefined) delete process.env.RVLAND_LICENSE_SK;
      else process.env.RVLAND_LICENSE_SK = antesL;
    }
  });
});
