import { describe, it, expect } from "vitest";
import { statusServidor } from "./servidor";

const agora = Date.parse("2026-08-17T12:00:00Z");

describe("statusServidor", () => {
  it("pendente enquanto não fez enroll", () => {
    expect(statusServidor({ status: "pendente", ultimoContatoEm: null }, agora)).toBe("pendente");
  });

  it("revogado tem precedência", () => {
    expect(
      statusServidor({ status: "revogado", ultimoContatoEm: new Date(agora) }, agora)
    ).toBe("revogado");
  });

  it("online com contato recente", () => {
    const recente = new Date(agora - 60 * 1000); // 1 min atrás
    expect(statusServidor({ status: "ativo", ultimoContatoEm: recente }, agora)).toBe("online");
  });

  it("offline quando o contato ficou velho (agente silencioso)", () => {
    const velho = new Date(agora - 10 * 60 * 1000); // 10 min atrás
    expect(statusServidor({ status: "ativo", ultimoContatoEm: velho }, agora)).toBe("offline");
  });

  it("ativo sem nenhum contato é offline", () => {
    expect(statusServidor({ status: "ativo", ultimoContatoEm: null }, agora)).toBe("offline");
  });

  it("limite configurável", () => {
    const t = new Date(agora - 90 * 1000);
    expect(statusServidor({ status: "ativo", ultimoContatoEm: t }, agora, 120)).toBe("online");
    expect(statusServidor({ status: "ativo", ultimoContatoEm: t }, agora, 60)).toBe("offline");
  });
});
