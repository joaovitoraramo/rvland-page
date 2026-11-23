import { describe, it, expect } from "vitest";
import { licencaHermes, type EntradaLicencaHermes } from "./licenca";
import { montarDocumentoHermes, modoDocumento, type EntradaDocumento } from "./documento";

const base: EntradaLicencaHermes = {
  agora: new Date("2026-01-05T15:00:00.000Z"),
  instalacaoRevogada: false,
  bloqueioManual: false,
  independeFinanceiro: false,
  renovacaoDias: 30,
  diasConfianca: 0,
  modoPanico: false,
  contrato: {
    ativo: true,
    faturasAbertas: [{ vencimento: "2026-01-10", toleranciaDias: 3, historica: false }],
  },
};

const ident = {
  instalacaoId: "11111111-1111-1111-1111-111111111111",
  servidorId: "22222222-2222-2222-2222-222222222222" as string | null,
  clienteId: "33333333-3333-3333-3333-333333333333",
  cnpj: "12345678000190",
  canal: "stable" as const,
};

const entrada = (over: Partial<EntradaDocumento> = {}, lic = base): EntradaDocumento => ({
  ...ident,
  licenca: licencaHermes(lic),
  enforcementAtivo: true,
  enforcementInstalacao: "herdar",
  ...over,
});

describe("modoDocumento", () => {
  it("valendo só com enforcement global ativo E instalação herdar", () => {
    expect(modoDocumento(true, "herdar")).toBe("valendo");
    expect(modoDocumento(true, "simular")).toBe("simulacao");
    expect(modoDocumento(false, "herdar")).toBe("simulacao");
    expect(modoDocumento(false, "simular")).toBe("simulacao");
  });
});

describe("montarDocumentoHermes", () => {
  it("monta o documento com todos os campos do desenho", () => {
    const d = montarDocumentoHermes(entrada());
    expect(d).toEqual({
      tipo: "hermes_licenca",
      v: 1,
      kid: "h1",
      instalacao_id: ident.instalacaoId,
      servidor_id: ident.servidorId,
      cliente_id: ident.clienteId,
      cnpj: ident.cnpj,
      emitido_em: "2026-01-05T15:00:00.000Z",
      status: "ativa",
      origem: "contrato",
      expira_em: "2026-01-10",
      carencia_ate: "2026-01-13",
      operar_ate: "2026-01-14T06:00:00.000Z",
      offline_ate: "2026-01-17T06:00:00.000Z",
      modo: "valendo",
      obrigatoria: true,
      canal: "stable",
      aviso: null,
      panico: false,
      bloqueante: false,
    });
  });

  it("bloqueante e panico vão no documento (regra do agente depende deles)", () => {
    const vencida = montarDocumentoHermes(
      entrada({}, { ...base, agora: new Date("2026-01-20T15:00:00.000Z") })
    );
    expect(vencida.bloqueante).toBe(true);
    expect(vencida.panico).toBe(false);
    const panico = montarDocumentoHermes(
      entrada({}, { ...base, agora: new Date("2026-01-20T15:00:00.000Z"), modoPanico: true })
    );
    expect(panico.bloqueante).toBe(false);
    expect(panico.panico).toBe(true);
    const manual = montarDocumentoHermes(entrada({}, { ...base, bloqueioManual: true, modoPanico: true }));
    expect(manual.bloqueante).toBe(true);
    expect(manual.panico).toBe(false);
  });

  it("modo simulacao => obrigatoria=false", () => {
    const a = montarDocumentoHermes(entrada({ enforcementAtivo: false }));
    expect(a.modo).toBe("simulacao");
    expect(a.obrigatoria).toBe(false);
    const b = montarDocumentoHermes(entrada({ enforcementInstalacao: "simular" }));
    expect(b.modo).toBe("simulacao");
    expect(b.obrigatoria).toBe(false);
  });

  it("servidor_id pode ser nulo (instalação ainda sem agente) e canal preview", () => {
    const d = montarDocumentoHermes(entrada({ servidorId: null, canal: "preview" }));
    expect(d.servidor_id).toBeNull();
    expect(d.canal).toBe("preview");
  });

  it("aviso de carência cita a data limite em pt-BR", () => {
    const d = montarDocumentoHermes(
      entrada({}, { ...base, agora: new Date("2026-01-11T15:00:00.000Z") })
    );
    expect(d.status).toBe("carencia");
    expect(d.aviso).toContain("carência");
    expect(d.aviso).toContain("13/01/2026");
  });

  it("aviso de bloqueio por status bloqueante", () => {
    const vencida = montarDocumentoHermes(
      entrada({}, { ...base, agora: new Date("2026-01-20T15:00:00.000Z") })
    );
    expect(vencida.status).toBe("vencida");
    expect(vencida.aviso).toMatch(/vencida/i);

    const bloqueada = montarDocumentoHermes(entrada({}, { ...base, bloqueioManual: true }));
    expect(bloqueada.aviso).toMatch(/bloqueada/i);

    const revogada = montarDocumentoHermes(entrada({}, { ...base, instalacaoRevogada: true }));
    expect(revogada.aviso).toMatch(/revogada/i);

    const semContrato = montarDocumentoHermes(entrada({}, { ...base, contrato: null }));
    expect(semContrato.aviso).toMatch(/contrato/i);

    const cancelada = montarDocumentoHermes(
      entrada({}, { ...base, contrato: { ativo: false, faturasAbertas: [] } })
    );
    expect(cancelada.aviso).toMatch(/cancel/i);
  });

  it("em pânico não avisa bloqueio", () => {
    const d = montarDocumentoHermes(
      entrada({}, { ...base, agora: new Date("2026-01-20T15:00:00.000Z"), modoPanico: true })
    );
    expect(d.aviso).toBeNull();
    expect(d.panico).toBe(true);
  });

  it("aviso de vencimento próximo só se avisarVencimentoDias estiver ligado (padrão desligado)", () => {
    const perto = { ...base, agora: new Date("2026-01-08T15:00:00.000Z") };
    expect(montarDocumentoHermes(entrada({}, perto)).aviso).toBeNull();
    const d = montarDocumentoHermes(entrada({ avisarVencimentoDias: 3 }, perto));
    expect(d.aviso).toContain("vence em breve");
    expect(d.aviso).toContain("10/01/2026");
    const longe = montarDocumentoHermes(entrada({ avisarVencimentoDias: 3 }));
    expect(longe.aviso).toBeNull();
  });
});
