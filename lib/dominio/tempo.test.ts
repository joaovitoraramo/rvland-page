import { describe, it, expect } from "vitest";
import {
  hojeSP,
  competenciaDe,
  competenciaAtual,
  vencimentoNaCompetencia,
  addDias,
  compararDatas,
  formatarDataBR,
  formatarCompetenciaBR,
} from "./tempo";

describe("hojeSP", () => {
  it("converte instante UTC para a data civil de São Paulo (UTC-3)", () => {
    // 01:00 UTC do dia 1º ainda é 22:00 do dia anterior em SP
    expect(hojeSP(new Date("2026-01-01T01:00:00Z"))).toBe("2025-12-31");
    expect(hojeSP(new Date("2026-01-01T03:00:00Z"))).toBe("2026-01-01");
    expect(hojeSP(new Date("2026-08-16T12:00:00Z"))).toBe("2026-08-16");
  });
});

describe("competência", () => {
  it("normaliza qualquer data para o dia 1º do mês", () => {
    expect(competenciaDe("2026-08-16")).toBe("2026-08-01");
    expect(competenciaDe("2026-12-01")).toBe("2026-12-01");
  });

  it("competenciaAtual usa a data civil de SP", () => {
    expect(competenciaAtual(new Date("2026-03-01T01:00:00Z"))).toBe("2026-02-01");
    expect(competenciaAtual(new Date("2026-03-05T12:00:00Z"))).toBe("2026-03-01");
  });
});

describe("vencimentoNaCompetencia", () => {
  it("monta o vencimento com o dia do contrato", () => {
    expect(vencimentoNaCompetencia("2026-08-01", 15)).toBe("2026-08-15");
    expect(vencimentoNaCompetencia("2026-02-01", 28)).toBe("2026-02-28");
    expect(vencimentoNaCompetencia("2026-11-01", 1)).toBe("2026-11-01");
  });
});

describe("addDias", () => {
  it("soma dias atravessando mês e ano", () => {
    expect(addDias("2026-08-15", 4)).toBe("2026-08-19");
    expect(addDias("2026-08-30", 4)).toBe("2026-09-03");
    expect(addDias("2026-12-30", 4)).toBe("2027-01-03");
    expect(addDias("2026-08-15", 0)).toBe("2026-08-15");
  });
});

describe("compararDatas", () => {
  it("ordena datas ISO", () => {
    expect(compararDatas("2026-08-01", "2026-08-15")).toBeLessThan(0);
    expect(compararDatas("2026-08-15", "2026-08-01")).toBeGreaterThan(0);
    expect(compararDatas("2026-08-15", "2026-08-15")).toBe(0);
  });
});

describe("formatação pt-BR", () => {
  it("formata data e competência", () => {
    expect(formatarDataBR("2026-08-16")).toBe("16/08/2026");
    expect(formatarCompetenciaBR("2026-08-01")).toBe("08/2026");
  });
});
