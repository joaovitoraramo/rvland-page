import { describe, it, expect } from "vitest";
import {
  licencaHermes,
  statusBloqueante,
  type EntradaLicencaHermes,
} from "./licenca";

const em = (iso: string) => new Date(iso);

const fatura = (vencimento: string, extra?: { historica?: boolean; toleranciaDias?: number }) => ({
  vencimento,
  toleranciaDias: 3,
  historica: false,
  ...extra,
});

const base: EntradaLicencaHermes = {
  agora: em("2026-01-05T15:00:00.000Z"), // 05/01 12:00 em SP
  instalacaoRevogada: false,
  bloqueioManual: false,
  independeFinanceiro: false,
  renovacaoDias: 30,
  diasConfianca: 0,
  modoPanico: false,
  contrato: { ativo: true, faturasAbertas: [fatura("2026-01-10")] },
};

describe("licencaHermes — contrato/faturas (tabela de transições)", () => {
  it("em dia 05/01, vence 10/01 (tolerância 3): operar até 14/01 06:00Z, offline +72h", () => {
    const r = licencaHermes(base);
    expect(r.status).toBe("ativa");
    expect(r.origem).toBe("contrato");
    expect(r.expira_em).toBe("2026-01-10");
    expect(r.carencia_ate).toBe("2026-01-13");
    expect(r.operar_ate).toBe("2026-01-14T06:00:00.000Z");
    expect(r.offline_ate).toBe("2026-01-17T06:00:00.000Z");
    expect(r.bloqueante).toBe(false);
    expect(r.emitido_em).toBe("2026-01-05T15:00:00.000Z");
  });

  it("11/01 sem pagar: carência; expira_em = vencimento mais antigo em aberto", () => {
    const r = licencaHermes({ ...base, agora: em("2026-01-11T15:00:00.000Z") });
    expect(r.status).toBe("carencia");
    expect(r.expira_em).toBe("2026-01-10");
    expect(r.carencia_ate).toBe("2026-01-13");
    expect(r.operar_ate).toBe("2026-01-14T06:00:00.000Z");
    expect(r.offline_ate).toBe("2026-01-17T06:00:00.000Z");
    expect(r.bloqueante).toBe(false);
  });

  it("13/01 ainda é carência (último dia tolerado roda inteiro)", () => {
    const r = licencaHermes({ ...base, agora: em("2026-01-13T20:00:00.000Z") });
    expect(r.status).toBe("carencia");
  });

  it("14/01 depois do corte: vencida e bloqueante (operar_ate = offline_ate = emitido_em)", () => {
    const agora = em("2026-01-14T06:00:01.000Z");
    const r = licencaHermes({ ...base, agora });
    expect(r.status).toBe("vencida");
    expect(r.bloqueante).toBe(true);
    expect(r.expira_em).toBe("2026-01-10");
    expect(r.operar_ate).toBe(agora.toISOString());
    expect(r.offline_ate).toBe(agora.toISOString());
  });

  it("pagamento lançado (fatura sai das abertas): volta a em dia e desbloqueia", () => {
    const r = licencaHermes({
      ...base,
      agora: em("2026-01-15T15:00:00.000Z"),
      contrato: {
        ativo: true,
        faturasAbertas: [],
        proximoAgendado: { vencimento: "2026-02-10", toleranciaDias: 3 },
      },
    });
    expect(r.status).toBe("ativa");
    expect(r.expira_em).toBe("2026-02-10");
    expect(r.operar_ate).toBe("2026-02-14T06:00:00.000Z");
    expect(r.bloqueante).toBe(false);
  });

  it("faturas históricas nunca participam", () => {
    const r = licencaHermes({
      ...base,
      agora: em("2026-03-01T15:00:00.000Z"),
      contrato: {
        ativo: true,
        faturasAbertas: [fatura("2025-06-10", { historica: true })],
        proximoAgendado: { vencimento: "2026-03-10", toleranciaDias: 3 },
      },
    });
    expect(r.status).toBe("ativa");
    expect(r.expira_em).toBe("2026-03-10");
  });

  it("dias_confianca estende a carência", () => {
    const r = licencaHermes({
      ...base,
      agora: em("2026-01-14T15:00:00.000Z"),
      diasConfianca: 2,
    });
    expect(r.status).toBe("carencia");
    expect(r.carencia_ate).toBe("2026-01-15");
    expect(r.operar_ate).toBe("2026-01-16T06:00:00.000Z");
  });

  it("dias_confianca tem teto (padrão 7)", () => {
    const r = licencaHermes({ ...base, diasConfianca: 30 });
    // 10/01 + 3 + 7 = 20/01
    expect(r.carencia_ate).toBe("2026-01-20");
    expect(r.operar_ate).toBe("2026-01-21T06:00:00.000Z");
  });

  it("teto configurável e confiança negativa vira 0", () => {
    const a = licencaHermes({ ...base, diasConfianca: 30, maxDiasConfianca: 2 });
    expect(a.carencia_ate).toBe("2026-01-15");
    const b = licencaHermes({ ...base, diasConfianca: -5 });
    expect(b.carencia_ate).toBe("2026-01-13");
  });

  it("offline_horas parametrizável", () => {
    const r = licencaHermes({ ...base, offlineHoras: 24 });
    expect(r.offline_ate).toBe("2026-01-15T06:00:00.000Z");
  });

  it("contrato encerrado → cancelada, bloqueante", () => {
    const r = licencaHermes({ ...base, contrato: { ativo: false, faturasAbertas: [] } });
    expect(r.status).toBe("cancelada");
    expect(r.bloqueante).toBe(true);
    expect(r.operar_ate).toBe(base.agora.toISOString());
    expect(r.offline_ate).toBe(base.agora.toISOString());
    expect(r.expira_em).toBeNull();
    expect(r.carencia_ate).toBeNull();
  });

  it("contrato ativo sem fatura nem agendamento: em dia com janela rolante (nunca 2099)", () => {
    const r = licencaHermes({ ...base, contrato: { ativo: true, faturasAbertas: [] } });
    expect(r.status).toBe("ativa");
    expect(r.expira_em).toBe("2026-02-04"); // hoje + 30
    expect(r.operar_ate.startsWith("2099")).toBe(false);
  });
});

describe("licencaHermes — corte às 03:00 SP (coerente com operar_ate 06:00Z)", () => {
  // O "dia de licença" vira às 03:00 de São Paulo (06:00Z), não à meia-noite.
  it("início da carência: 05:59Z de 11/01 ainda é dia 10/01 (ativa); 06:00Z já é 11/01 (carência)", () => {
    expect(licencaHermes({ ...base, agora: em("2026-01-11T02:59:00.000Z") }).status).toBe("ativa");
    expect(licencaHermes({ ...base, agora: em("2026-01-11T05:59:59.000Z") }).status).toBe("ativa");
    expect(licencaHermes({ ...base, agora: em("2026-01-11T06:00:00.000Z") }).status).toBe("carencia");
  });

  it("fim da carência (13/01 é o último dia tolerado): carência até 05:59:59Z de 14/01", () => {
    for (const iso of ["2026-01-14T02:59:00.000Z", "2026-01-14T03:00:00.000Z", "2026-01-14T05:59:59.000Z"]) {
      const r = licencaHermes({ ...base, agora: em(iso) });
      expect(r.status).toBe("carencia");
      expect(r.bloqueante).toBe(false);
      expect(r.operar_ate).toBe("2026-01-14T06:00:00.000Z");
    }
  });

  it("às 06:00Z de 14/01 (03:00 SP) vira vencida, exatamente em operar_ate", () => {
    const antes = licencaHermes({ ...base, agora: em("2026-01-14T05:59:59.999Z") });
    const depois = licencaHermes({ ...base, agora: em("2026-01-14T06:00:00.000Z") });
    expect(antes.status).toBe("carencia");
    expect(depois.status).toBe("vencida");
    expect(depois.bloqueante).toBe(true);
    expect(depois.operar_ate).toBe("2026-01-14T06:00:00.000Z");
  });

  it("corte exato: operar_ate é 06:00Z (03:00 SP) do dia seguinte à carência", () => {
    const r = licencaHermes(base);
    expect(new Date(r.operar_ate).getTime() - 3 * 3600 * 1000).toBe(
      Date.parse("2026-01-14T03:00:00.000Z")
    );
  });

  it("independe_financeiro: o dia rolante também vira às 03:00 SP", () => {
    const e = { ...base, independeFinanceiro: true, contrato: null };
    expect(licencaHermes({ ...e, agora: em("2026-01-05T05:59:00.000Z") }).expira_em).toBe("2026-02-03");
    expect(licencaHermes({ ...e, agora: em("2026-01-05T06:00:00.000Z") }).expira_em).toBe("2026-02-04");
  });
});

describe("licencaHermes — renovacaoDias robusto", () => {
  const valores = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2147483647, 0, -5, 1e15];

  it("independe_financeiro nunca lança com renovacaoDias absurdo e fica no intervalo [1, 3650]", () => {
    for (const renovacaoDias of valores) {
      const r = licencaHermes({ ...base, independeFinanceiro: true, contrato: null, renovacaoDias });
      expect(r.status).toBe("ativa");
      expect(r.expira_em).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.operar_ate.startsWith("2099")).toBe(false);
    }
  });

  it("0, negativo, NaN e Infinity valem 1 dia; acima do teto vale 3650", () => {
    const mk = (renovacaoDias: number) =>
      licencaHermes({ ...base, independeFinanceiro: true, contrato: null, renovacaoDias }).expira_em;
    expect(mk(0)).toBe("2026-01-06");
    expect(mk(-5)).toBe("2026-01-06");
    expect(mk(Number.NaN)).toBe("2026-01-06");
    expect(mk(2147483647)).toBe("2036-01-03"); // 05/01/2026 + 3650
    expect(mk(3650)).toBe("2036-01-03");
  });

  it("janela rolante do contrato sem fatura/agendamento também é limitada e não lança", () => {
    for (const renovacaoDias of valores) {
      const r = licencaHermes({
        ...base,
        renovacaoDias,
        contrato: { ativo: true, faturasAbertas: [] },
      });
      expect(r.status).toBe("ativa");
      expect(r.expira_em).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const mk = (renovacaoDias: number) =>
      licencaHermes({ ...base, renovacaoDias, contrato: { ativo: true, faturasAbertas: [] } }).expira_em;
    expect(mk(0)).toBe("2026-01-06");
    expect(mk(2147483647)).toBe("2036-01-03");
  });
});

describe("licencaHermes — exceções e precedência", () => {
  it("bloqueio manual vence tudo, imediato (inclusive pânico e independente)", () => {
    const r = licencaHermes({
      ...base,
      bloqueioManual: true,
      modoPanico: true,
      independeFinanceiro: true,
    });
    expect(r.status).toBe("bloqueada");
    expect(r.origem).toBe("bloqueio_manual");
    expect(r.bloqueante).toBe(true);
    expect(r.operar_ate).toBe(base.agora.toISOString());
    expect(r.offline_ate).toBe(base.agora.toISOString());
  });

  it("instalação revogada vence tudo, inclusive bloqueio manual e pânico", () => {
    const r = licencaHermes({
      ...base,
      instalacaoRevogada: true,
      bloqueioManual: true,
      modoPanico: true,
    });
    expect(r.status).toBe("revogada");
    expect(r.origem).toBe("instalacao_revogada");
    expect(r.bloqueante).toBe(true);
    expect(r.operar_ate).toBe(base.agora.toISOString());
  });

  it("independe_financeiro sem contrato: ativa, expira hoje + renovacao_dias, carência +3", () => {
    const r = licencaHermes({ ...base, independeFinanceiro: true, contrato: null });
    expect(r.status).toBe("ativa");
    expect(r.origem).toBe("independente");
    expect(r.expira_em).toBe("2026-02-04");
    expect(r.carencia_ate).toBe("2026-02-07");
    expect(r.operar_ate).toBe("2026-02-08T06:00:00.000Z");
    expect(r.offline_ate).toBe("2026-02-11T06:00:00.000Z");
    expect(r.bloqueante).toBe(false);
  });

  it("independe_financeiro é rolante: avança com o dia", () => {
    const a = licencaHermes({ ...base, independeFinanceiro: true, contrato: null });
    const b = licencaHermes({
      ...base,
      independeFinanceiro: true,
      contrato: null,
      agora: em("2026-01-06T15:00:00.000Z"),
    });
    expect(b.expira_em).toBe("2026-02-05");
    expect(b.expira_em! > a.expira_em!).toBe(true);
  });

  it("independe_financeiro ignora contrato vencido/cancelado", () => {
    const r = licencaHermes({
      ...base,
      independeFinanceiro: true,
      agora: em("2026-06-01T15:00:00.000Z"),
      renovacaoDias: 10,
    });
    expect(r.status).toBe("ativa");
    expect(r.origem).toBe("independente");
    expect(r.expira_em).toBe("2026-06-11");
  });

  it("sem contrato e sem flag → sem_contrato, bloqueante", () => {
    const r = licencaHermes({ ...base, contrato: null });
    expect(r.status).toBe("sem_contrato");
    expect(r.origem).toBe("sem_contrato");
    expect(r.bloqueante).toBe(true);
    expect(r.operar_ate).toBe(base.agora.toISOString());
  });

  it("pânico em status não manual: operar_ate = 2099, não bloqueante, sinalizado", () => {
    const vencida = licencaHermes({
      ...base,
      agora: em("2026-01-20T15:00:00.000Z"),
      modoPanico: true,
    });
    expect(vencida.operar_ate).toBe("2099-01-01T00:00:00.000Z");
    expect(vencida.offline_ate).toBe("2099-01-01T00:00:00.000Z");
    expect(vencida.bloqueante).toBe(false);
    expect(vencida.panico).toBe(true);

    const semContrato = licencaHermes({ ...base, contrato: null, modoPanico: true });
    expect(semContrato.status).toBe("sem_contrato");
    expect(semContrato.operar_ate).toBe("2099-01-01T00:00:00.000Z");
    expect(semContrato.bloqueante).toBe(false);

    const cancelada = licencaHermes({
      ...base,
      contrato: { ativo: false, faturasAbertas: [] },
      modoPanico: true,
    });
    expect(cancelada.operar_ate).toBe("2099-01-01T00:00:00.000Z");
    expect(cancelada.bloqueante).toBe(false);
  });

  it("sem pânico o campo panico é false", () => {
    expect(licencaHermes(base).panico).toBe(false);
  });
});

describe("statusBloqueante", () => {
  it("lista os status bloqueantes", () => {
    for (const s of ["vencida", "bloqueada", "revogada", "sem_contrato", "cancelada"] as const) {
      expect(statusBloqueante(s)).toBe(true);
    }
    for (const s of ["ativa", "carencia"] as const) {
      expect(statusBloqueante(s)).toBe(false);
    }
  });
});
