import { describe, expect, it } from "vitest";

import {
  FRASE_VALER,
  ROTULO_STATUS_LICENCA,
  formatarCnpj,
  formatarDataCivil,
  avaliarProntidaoEnforcement,
  chaveConfigurada,
  confirmacaoValerConfere,
  resumoSaude,
  situacaoChave,
} from "./painel";

const AGORA = new Date("2026-11-24T12:00:00.000Z");
const h = (horas: number) => new Date(AGORA.getTime() + horas * 3600_000);

describe("situacaoChave", () => {
  const base = { usadaEm: null, revogadaEm: null, expiraEm: h(5) };
  it("ativa: não usada, não revogada e dentro da validade", () => {
    expect(situacaoChave(base, AGORA)).toBe("ativa");
  });
  it("expirada: passou da validade sem uso", () => {
    expect(situacaoChave({ ...base, expiraEm: h(-1) }, AGORA)).toBe("expirada");
    expect(situacaoChave({ ...base, expiraEm: AGORA }, AGORA)).toBe("expirada");
  });
  it("revogada tem precedência sobre expirada", () => {
    expect(situacaoChave({ ...base, revogadaEm: h(-2), expiraEm: h(-1) }, AGORA)).toBe("revogada");
  });
  it("usada tem precedência sobre expirada", () => {
    expect(situacaoChave({ ...base, usadaEm: h(-3), expiraEm: h(-1) }, AGORA)).toBe("usada");
  });
});

describe("chaveConfigurada / resumoSaude", () => {
  it("só true literal conta como prova", () => {
    expect(chaveConfigurada({ chave_configurada: true })).toBe(true);
    expect(chaveConfigurada({ chave_configurada: false })).toBe(false);
    expect(chaveConfigurada({ chave_configurada: "true" })).toBeNull();
    expect(chaveConfigurada({})).toBeNull();
    expect(chaveConfigurada(null)).toBeNull();
  });

  it("resumo da saúde reportada pelo agente, tolerante a ausência e a lixo", () => {
    expect(resumoSaude(null)).toEqual({ container: null, saude: null, relogioConfiavel: null, agenteVersao: null });
    expect(
      resumoSaude({ container: "rodando", saude: "saudavel", relogio_confiavel: false, agente_versao: "0.7.0", _controle: { boots: [] } })
    ).toEqual({ container: "rodando", saude: "saudavel", relogioConfiavel: false, agenteVersao: "0.7.0" });
    expect(resumoSaude({ container: 3, saude: {}, relogio_confiavel: "x", agente_versao: null })).toEqual({
      container: null,
      saude: null,
      relogioConfiavel: null,
      agenteVersao: null,
    });
  });
});

describe("avaliarProntidaoEnforcement (PASSAR A VALER)", () => {
  const inst = (id: string, status: string, saude: Record<string, unknown> | null) => ({ id, nome: `Loja ${id}`, status, saude });

  it("bloqueia sem nenhuma instalação ativa (sem prova possível)", () => {
    const r = avaliarProntidaoEnforcement([]);
    expect(r.pode).toBe(false);
    expect(r.total).toBe(0);
    expect(r.motivo).toMatch(/nenhuma instalação ativa/i);
  });

  it("bloqueia enquanto o agente não reporta chave_configurada (estado real hoje)", () => {
    const r = avaliarProntidaoEnforcement([inst("a", "ativa", { container: "rodando" }), inst("b", "ativa", null)]);
    expect(r.pode).toBe(false);
    expect(r.comProva).toBe(0);
    expect(r.total).toBe(2);
    expect(r.motivo).toMatch(/chave_configurada/);
  });

  it("bloqueia se uma só instalação ativa não tem prova (nomeia quem falta)", () => {
    const r = avaliarProntidaoEnforcement([inst("a", "ativa", { chave_configurada: true }), inst("b", "ativa", { chave_configurada: false })]);
    expect(r.pode).toBe(false);
    expect(r.comProva).toBe(1);
    expect(r.motivo).toMatch(/1 de 2/);
    expect(r.motivo).toContain("Loja b");
  });

  it("libera só com TODAS as ativas provando chave real", () => {
    const r = avaliarProntidaoEnforcement([inst("a", "ativa", { chave_configurada: true }), inst("b", "ativa", { chave_configurada: true })]);
    expect(r).toMatchObject({ pode: true, comProva: 2, total: 2, motivo: null });
  });

  it("ignora instalações que não estão ativas (aguardando, revogada, desinstalada)", () => {
    const r = avaliarProntidaoEnforcement([
      inst("a", "ativa", { chave_configurada: true }),
      inst("b", "aguardando_ativacao", null),
      inst("c", "revogada", null),
      inst("d", "desinstalada", null),
    ]);
    expect(r).toMatchObject({ pode: true, total: 1 });
  });
});

describe("confirmacaoValerConfere", () => {
  it("exige a frase, sem diferenciar caixa nem espaços nas pontas", () => {
    expect(FRASE_VALER).toBe("VALER HERMES");
    expect(confirmacaoValerConfere("VALER HERMES")).toBe(true);
    expect(confirmacaoValerConfere("  valer hermes ")).toBe(true);
    expect(confirmacaoValerConfere("valer")).toBe(false);
    expect(confirmacaoValerConfere("")).toBe(false);
    expect(confirmacaoValerConfere(null)).toBe(false);
    expect(confirmacaoValerConfere(undefined)).toBe(false);
  });
});

describe("apresentação", () => {
  it("data civil YYYY-MM-DD vira dd/mm/aaaa, sem passar por fuso", () => {
    expect(formatarDataCivil("2026-11-03")).toBe("03/11/2026");
    expect(formatarDataCivil(null)).toBe("—");
    expect(formatarDataCivil("lixo")).toBe("—");
  });

  it("todo status de licença tem rótulo em pt-BR", () => {
    expect(Object.keys(ROTULO_STATUS_LICENCA).sort()).toEqual(
      ["ativa", "bloqueada", "cancelada", "carencia", "revogada", "sem_contrato", "vencida"]
    );
    expect(ROTULO_STATUS_LICENCA.carencia).toBe("Em carência");
  });
});

describe("formatarCnpj", () => {
  it("máscara em 14 dígitos; outra coisa volta como veio (ou — se vazio)", () => {
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCnpj("11.222.333/0001-81")).toBe("11.222.333/0001-81");
    expect(formatarCnpj("123")).toBe("123");
    expect(formatarCnpj(null)).toBe("—");
  });
});
