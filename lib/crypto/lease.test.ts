import { describe, it, expect, beforeAll } from "vitest";
import { gerarParEd25519 } from "./ed25519";
import { assinarLease, verificarLease } from "./lease";
import type { LeasePayload } from "@/lib/dominio/lease";

const payload: LeasePayload = {
  v: 1,
  servidor_id: "srv-1",
  cliente_id: "cli-1",
  emitido_em: "2026-08-17T03:00:00.000Z",
  status: "atrasado",
  operar_ate: "2026-08-20T06:00:00.000Z",
  renovar_apos: "2026-08-17T15:00:00.000Z",
  servicos_licenciados: ["concicredit.service"],
  modo_simulacao: false,
  panico: false,
};

describe("assinatura do lease", () => {
  beforeAll(() => {
    const par = gerarParEd25519();
    process.env.RVLAND_LICENSE_SK = par.privadaB64;
    process.env.RVLAND_LICENSE_PK = par.publicaB64;
  });

  it("assina e verifica o envelope, recuperando o payload", () => {
    const env = assinarLease(payload);
    expect(env.payload).toBeTruthy();
    expect(env.assinatura).toBeTruthy();

    const recuperado = verificarLease(env);
    expect(recuperado).not.toBeNull();
    expect(recuperado!.operar_ate).toBe("2026-08-20T06:00:00.000Z");
    expect(recuperado!.servicos_licenciados).toEqual(["concicredit.service"]);
  });

  it("rejeita envelope adulterado", () => {
    const env = assinarLease(payload);
    const adulterado = {
      ...env,
      payload: Buffer.from(
        JSON.stringify({ ...payload, operar_ate: "2099-01-01T00:00:00.000Z" })
      ).toString("base64"),
    };
    expect(verificarLease(adulterado)).toBeNull();
  });
});
