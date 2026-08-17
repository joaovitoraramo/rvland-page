import { describe, it, expect } from "vitest";
import { statusLicenca, type EntradaLicenca } from "./licenca";

const base: EntradaLicenca = {
  hoje: "2026-08-16",
  contratosRecorrentesAtivos: 1,
  tinhaContratoRecorrente: true,
  faturasAbertas: [],
  diasConfianca: 0,
  bloqueioManual: false,
  modoPanico: false,
};

const fatura = (vencimento: string, extra?: Partial<EntradaLicenca["faturasAbertas"][number]>) => ({
  vencimento,
  toleranciaDias: 4,
  historica: false,
  ...extra,
});

describe("statusLicenca", () => {
  it("sem contrato recorrente nunca ativo → sem_licenca (cliente fechado)", () => {
    const r = statusLicenca({
      ...base,
      contratosRecorrentesAtivos: 0,
      tinhaContratoRecorrente: false,
    });
    expect(r.status).toBe("sem_licenca");
  });

  it("teve recorrente e todos encerrados → cancelado", () => {
    const r = statusLicenca({ ...base, contratosRecorrentesAtivos: 0 });
    expect(r.status).toBe("cancelado");
  });

  it("bloqueio manual vence tudo, inclusive pânico", () => {
    const r = statusLicenca({ ...base, bloqueioManual: true, modoPanico: true });
    expect(r.status).toBe("bloqueado");
  });

  it("sem fatura vencida → em_dia", () => {
    const r = statusLicenca({ ...base, faturasAbertas: [fatura("2026-08-20")] });
    expect(r.status).toBe("em_dia");
    expect(r.venceEm).toBe("2026-08-20");
  });

  it("vencida dentro da tolerância → atrasado com toleradoAte", () => {
    // venceu 15/08, tolerância 4 → tolerado até 19/08; hoje 16/08
    const r = statusLicenca({ ...base, faturasAbertas: [fatura("2026-08-15")] });
    expect(r.status).toBe("atrasado");
    expect(r.toleradoAte).toBe("2026-08-19");
  });

  it("no último dia de tolerância ainda é atrasado", () => {
    const r = statusLicenca({
      ...base,
      hoje: "2026-08-19",
      faturasAbertas: [fatura("2026-08-15")],
    });
    expect(r.status).toBe("atrasado");
  });

  it("além da tolerância → bloqueado", () => {
    const r = statusLicenca({
      ...base,
      hoje: "2026-08-20",
      faturasAbertas: [fatura("2026-08-15")],
    });
    expect(r.status).toBe("bloqueado");
  });

  it("dias de confiança estendem a tolerância", () => {
    const r = statusLicenca({
      ...base,
      hoje: "2026-08-21",
      diasConfianca: 3,
      faturasAbertas: [fatura("2026-08-15")], // 15 + 4 + 3 = tolerado até 22
    });
    expect(r.status).toBe("atrasado");
    expect(r.toleradoAte).toBe("2026-08-22");
  });

  it("fatura histórica é ignorada", () => {
    const r = statusLicenca({
      ...base,
      hoje: "2026-08-30",
      faturasAbertas: [fatura("2026-01-15", { historica: true })],
    });
    expect(r.status).toBe("em_dia");
  });

  it("pânico impede bloqueado por atraso (vira atrasado)", () => {
    const r = statusLicenca({
      ...base,
      hoje: "2026-08-30",
      modoPanico: true,
      faturasAbertas: [fatura("2026-08-15")],
    });
    expect(r.status).toBe("atrasado");
  });

  it("usa a fatura vencida mais antiga como referência", () => {
    const r = statusLicenca({
      ...base,
      hoje: "2026-08-16",
      faturasAbertas: [fatura("2026-08-15"), fatura("2026-07-15")],
    });
    expect(r.status).toBe("bloqueado"); // julho estourou há muito
    expect(r.toleradoAte).toBe("2026-07-19");
  });
});
