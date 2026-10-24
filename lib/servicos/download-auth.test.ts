import { describe, it, expect, afterEach } from "vitest";

import { gerarParEd25519, assinar } from "@/lib/crypto/ed25519";
import { mensagemAssinada } from "@/lib/crypto/heartbeat-auth";
import {
  autenticarDownload,
  exigirAuthDownload,
  mensagemDownload,
  type DepsDownload,
  type PedidoDownload,
} from "./download-auth";

const SERVIDOR_ID = "11111111-1111-4111-8111-111111111111";
const VERSAO = "0.6.0";
const ARCH = "amd64";

// assina um pedido de download como o agente faz (mesmo esquema do heartbeat)
function assinarPedido(privadaB64: string, ts: string, versao = VERSAO, arch = ARCH): string {
  return assinar(mensagemAssinada(ts, mensagemDownload(versao, arch)), privadaB64);
}

function deps(servidor: { id: string; agentePubkey: string | null } | null, enroll: { id: string } | null): DepsDownload {
  return {
    async servidorAtivo() {
      return servidor;
    },
    async servidorPorEnroll() {
      return enroll;
    },
  };
}

function pedidoBase(over: Partial<PedidoDownload> = {}): PedidoDownload {
  return {
    versao: VERSAO,
    arch: ARCH,
    servidorId: "",
    timestamp: "",
    assinatura: "",
    enrollToken: "",
    ...over,
  };
}

describe("autenticarDownload", () => {
  it("assinatura de enroll válida → metodo 'assinatura' (200)", async () => {
    const { publicaB64, privadaB64 } = gerarParEd25519();
    const ts = new Date().toISOString();
    const r = await autenticarDownload(
      pedidoBase({ servidorId: SERVIDOR_ID, timestamp: ts, assinatura: assinarPedido(privadaB64, ts) }),
      deps({ id: SERVIDOR_ID, agentePubkey: publicaB64 }, null)
    );
    expect(r).toEqual({ metodo: "assinatura", servidorId: SERVIDOR_ID });
  });

  it("token de enroll válido → metodo 'enroll' (200)", async () => {
    const r = await autenticarDownload(
      pedidoBase({ enrollToken: "tok-de-enroll" }),
      deps(null, { id: SERVIDOR_ID })
    );
    expect(r).toEqual({ metodo: "enroll", servidorId: SERVIDOR_ID });
  });

  it("sem credencial → metodo 'nenhuma' (ainda 200 por compat enquanto o flag está off)", async () => {
    const r = await autenticarDownload(pedidoBase(), deps(null, null));
    expect(r).toEqual({ metodo: "nenhuma", servidorId: null });
  });

  it("agente 0.5.0 (não assina, sem enroll) continua baixando: metodo 'nenhuma'", async () => {
    // 0.5.0 faz um GET limpo, sem headers de assinatura nem X-RVLand-Enroll
    const r = await autenticarDownload(pedidoBase(), deps({ id: SERVIDOR_ID, agentePubkey: "x" }, { id: SERVIDOR_ID }));
    expect(r.metodo).toBe("nenhuma");
  });

  it("assinatura para OUTRO recurso (versao/arch) não autentica", async () => {
    const { publicaB64, privadaB64 } = gerarParEd25519();
    const ts = new Date().toISOString();
    const r = await autenticarDownload(
      // assina para 0.6.0/amd64 mas pede 0.7.0/arm64
      pedidoBase({ versao: "0.7.0", arch: "arm64", servidorId: SERVIDOR_ID, timestamp: ts, assinatura: assinarPedido(privadaB64, ts) }),
      deps({ id: SERVIDOR_ID, agentePubkey: publicaB64 }, null)
    );
    expect(r.metodo).toBe("nenhuma");
  });

  it("assinatura com timestamp fora da janela é rejeitada", async () => {
    const { publicaB64, privadaB64 } = gerarParEd25519();
    const ts = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // -10 min
    const r = await autenticarDownload(
      pedidoBase({ servidorId: SERVIDOR_ID, timestamp: ts, assinatura: assinarPedido(privadaB64, ts) }),
      deps({ id: SERVIDOR_ID, agentePubkey: publicaB64 }, null)
    );
    expect(r.metodo).toBe("nenhuma");
  });

  it("assinatura de outra chave é rejeitada", async () => {
    const legit = gerarParEd25519();
    const intruso = gerarParEd25519();
    const ts = new Date().toISOString();
    const r = await autenticarDownload(
      pedidoBase({ servidorId: SERVIDOR_ID, timestamp: ts, assinatura: assinarPedido(intruso.privadaB64, ts) }),
      deps({ id: SERVIDOR_ID, agentePubkey: legit.publicaB64 }, null)
    );
    expect(r.metodo).toBe("nenhuma");
  });
});

describe("exigirAuthDownload (flag de transição)", () => {
  const orig = process.env.RVLAND_EXIGIR_AUTH_DOWNLOAD;
  afterEach(() => {
    if (orig === undefined) delete process.env.RVLAND_EXIGIR_AUTH_DOWNLOAD;
    else process.env.RVLAND_EXIGIR_AUTH_DOWNLOAD = orig;
  });

  it("desligado por padrão (ausente)", () => {
    delete process.env.RVLAND_EXIGIR_AUTH_DOWNLOAD;
    expect(exigirAuthDownload()).toBe(false);
  });

  it("liga com 1/on/true", () => {
    for (const v of ["1", "on", "true", "TRUE"]) {
      process.env.RVLAND_EXIGIR_AUTH_DOWNLOAD = v;
      expect(exigirAuthDownload()).toBe(true);
    }
  });

  it("segue desligado com outros valores", () => {
    process.env.RVLAND_EXIGIR_AUTH_DOWNLOAD = "0";
    expect(exigirAuthDownload()).toBe(false);
  });
});
