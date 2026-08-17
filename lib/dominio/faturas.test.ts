import { describe, it, expect } from "vitest";
import { deveGerarFatura, montarFatura } from "./faturas";

const contrato = {
  tipo: "recorrente" as string,
  status: "ativo" as string,
  inicio: "2026-01-10",
  diaVencimento: 15 as number | null,
};

describe("deveGerarFatura", () => {
  it("gera para recorrente ativo sem fatura na competência", () => {
    expect(deveGerarFatura(contrato, "2026-08-01", false)).toBe(true);
  });

  it("não gera se já existe", () => {
    expect(deveGerarFatura(contrato, "2026-08-01", true)).toBe(false);
  });

  it("não gera para encerrado", () => {
    expect(deveGerarFatura({ ...contrato, status: "encerrado" }, "2026-08-01", false)).toBe(false);
  });

  it("não gera para contrato fechado", () => {
    expect(deveGerarFatura({ ...contrato, tipo: "fechado" }, "2026-08-01", false)).toBe(false);
  });

  it("não gera para competência anterior ao início do contrato", () => {
    expect(deveGerarFatura(contrato, "2025-12-01", false)).toBe(false);
    // mês do próprio início gera
    expect(deveGerarFatura(contrato, "2026-01-01", false)).toBe(true);
  });

  it("não gera sem dia de vencimento", () => {
    expect(deveGerarFatura({ ...contrato, diaVencimento: null }, "2026-08-01", false)).toBe(false);
  });
});

describe("montarFatura", () => {
  it("monta vencimento no dia do contrato", () => {
    expect(montarFatura(contrato, "2026-08-01", 180000)).toEqual({
      competencia: "2026-08-01",
      vencimento: "2026-08-15",
      valorCentavos: 180000,
    });
  });
});
