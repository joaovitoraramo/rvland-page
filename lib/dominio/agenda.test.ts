import { describe, it, expect } from "vitest";
import { addMeses } from "./tempo";
import { proximoVencimentoAgendado } from "./faturas";
import { statusLicenca, type EntradaLicenca } from "./licenca";

describe("addMeses", () => {
  it("soma meses virando o ano", () => {
    expect(addMeses("2026-08-01", 1)).toBe("2026-09-01");
    expect(addMeses("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMeses("2026-01-01", 12)).toBe("2027-01-01");
  });
});

describe("proximoVencimentoAgendado", () => {
  it("projeta o mês seguinte à última competência faturada (Credit pagou agosto)", () => {
    // faturas de mar–ago; hoje 17/08 → próximo é 15/09
    const comps = ["2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"];
    expect(proximoVencimentoAgendado(15, comps, "2026-08-17")).toBe("2026-09-15");
  });

  it("sem faturas: usa a competência de hoje, avançando se já passou", () => {
    expect(proximoVencimentoAgendado(15, [], "2026-08-10")).toBe("2026-08-15");
    expect(proximoVencimentoAgendado(15, [], "2026-08-20")).toBe("2026-09-15");
  });

  it("avança enquanto o vencimento estiver no passado (dados velhos)", () => {
    expect(proximoVencimentoAgendado(15, ["2026-05-01"], "2026-08-17")).toBe("2026-09-15");
  });
});

describe("statusLicenca com próximo vencimento agendado", () => {
  const base: EntradaLicenca = {
    hoje: "2026-08-17",
    contratosRecorrentesAtivos: 1,
    tinhaContratoRecorrente: true,
    faturasAbertas: [], // agosto já foi paga → nenhuma aberta
    diasConfianca: 0,
    bloqueioManual: false,
    modoPanico: false,
    proximoAgendado: { vencimento: "2026-09-15", toleranciaDias: 4 },
  };

  it("em dia usa a agenda quando não há fatura aberta (bug da Credit)", () => {
    const r = statusLicenca(base);
    expect(r.status).toBe("em_dia");
    expect(r.venceEm).toBe("2026-09-15");
    expect(r.toleradoAte).toBe("2026-09-19"); // 15 + 4
  });

  it("dias de confiança estendem também o em dia agendado", () => {
    const r = statusLicenca({ ...base, diasConfianca: 3 });
    expect(r.toleradoAte).toBe("2026-09-22"); // 15 + 4 + 3
  });
});
