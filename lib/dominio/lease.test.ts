import { describe, it, expect } from "vitest";
import { montarLease, type EntradaLease } from "./lease";
import type { ResultadoLicenca } from "./licenca";

const lic = (over: Partial<ResultadoLicenca>): ResultadoLicenca => ({
  status: "em_dia",
  venceEm: "2026-09-15",
  toleradoAte: null,
  ...over,
});

const base: EntradaLease = {
  servidorId: "srv-1",
  clienteId: "cli-1",
  hoje: "2026-08-17",
  licenca: lic({}),
  servicosLicenciados: ["concicredit.service"],
  modoSimulacao: false,
  modoPanico: false,
};

describe("montarLease — operar_ate", () => {
  it("em dia: opera até a madrugada seguinte ao fim da tolerância do próximo venc.", () => {
    // próximo venc 15/09, tolerância → tolerado até 19/09; corta 03:00 de 20/09
    const l = montarLease({
      ...base,
      licenca: lic({ status: "em_dia", venceEm: "2026-09-15", toleradoAte: "2026-09-19" }),
    });
    expect(l.status).toBe("em_dia");
    expect(l.operar_ate).toBe("2026-09-20T06:00:00.000Z");
  });

  it("em dia sem tolerância conhecida cai no futuro distante (outage-safe)", () => {
    const l = montarLease({ ...base, licenca: lic({ status: "em_dia", toleradoAte: null }) });
    expect(l.operar_ate).toBe("2099-01-01T00:00:00.000Z");
  });

  it("atrasado: opera até a madrugada seguinte ao último dia tolerado", () => {
    // tolerado até 19/08 inclusive → corta 03:00 SP de 20/08 (06:00Z)
    const l = montarLease({
      ...base,
      licenca: lic({ status: "atrasado", toleradoAte: "2026-08-19", venceEm: null }),
    });
    expect(l.status).toBe("atrasado");
    expect(l.operar_ate).toBe("2026-08-20T06:00:00.000Z");
  });

  it("bloqueado: operar_ate no passado (corta já)", () => {
    const l = montarLease({
      ...base,
      hoje: "2026-08-25",
      licenca: lic({ status: "bloqueado", toleradoAte: "2026-08-19", venceEm: null }),
    });
    expect(l.status).toBe("bloqueado");
    expect(l.operar_ate < "2026-08-25").toBe(true);
  });

  it("cancelado também corta (operar_ate no passado)", () => {
    const l = montarLease({
      ...base,
      hoje: "2026-08-25",
      licenca: lic({ status: "cancelado", venceEm: null }),
    });
    expect(l.status).toBe("cancelado");
    expect(l.operar_ate < "2026-08-25").toBe(true);
  });

  it("sem_licenca: nunca força bloqueio (operar_ate muito no futuro)", () => {
    const l = montarLease({
      ...base,
      licenca: lic({ status: "sem_licenca", venceEm: null }),
    });
    expect(l.status).toBe("sem_licenca");
    expect(l.operar_ate > "2027-01-01").toBe(true);
  });
});

describe("montarLease — flags e conteúdo", () => {
  it("carrega serviços licenciados e flags", () => {
    const l = montarLease({ ...base, modoSimulacao: true, modoPanico: false });
    expect(l.servicos_licenciados).toEqual(["concicredit.service"]);
    expect(l.modo_simulacao).toBe(true);
    expect(l.panico).toBe(false);
    expect(l.servidor_id).toBe("srv-1");
    expect(l.cliente_id).toBe("cli-1");
    expect(l.v).toBe(1);
  });

  it("renovar_apos fica algumas horas à frente do emitido_em", () => {
    const l = montarLease({ ...base, emitidoEm: new Date("2026-08-17T03:00:00Z") });
    expect(l.emitido_em).toBe("2026-08-17T03:00:00.000Z");
    expect(l.renovar_apos).toBe("2026-08-17T15:00:00.000Z"); // +12h
  });

  it("pânico empurra operar_ate para o futuro distante mesmo em atraso", () => {
    const l = montarLease({
      ...base,
      hoje: "2026-08-25",
      modoPanico: true,
      licenca: lic({ status: "bloqueado", toleradoAte: "2026-08-19", venceEm: null }),
    });
    // status reflete a verdade, mas o agente não deve cortar
    expect(l.status).toBe("bloqueado");
    expect(l.panico).toBe(true);
    expect(l.operar_ate > "2027-01-01").toBe(true);
  });
});
