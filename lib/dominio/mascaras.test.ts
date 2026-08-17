import { describe, it, expect } from "vitest";
import {
  mascararCompetencia,
  mascararDinheiro,
  mascararDocumento,
  mascararTelefone,
} from "./mascaras";

describe("mascararCompetencia (MM/AAAA progressivo)", () => {
  it("insere a barra sozinho", () => {
    expect(mascararCompetencia("0")).toBe("0");
    expect(mascararCompetencia("04")).toBe("04");
    expect(mascararCompetencia("042")).toBe("04/2");
    expect(mascararCompetencia("042026")).toBe("04/2026");
  });

  it("aceita colar já formatado e re-normaliza", () => {
    expect(mascararCompetencia("04/2026")).toBe("04/2026");
  });

  it("descarta não-dígitos e limita a 6 dígitos", () => {
    expect(mascararCompetencia("04.2026xyz")).toBe("04/2026");
    expect(mascararCompetencia("0420267777")).toBe("04/2026");
    expect(mascararCompetencia("")).toBe("");
  });
});

describe("mascararDinheiro (estilo banco: digita centavos)", () => {
  it("formata progressivamente a partir dos dígitos", () => {
    expect(mascararDinheiro("1")).toBe("0,01");
    expect(mascararDinheiro("15")).toBe("0,15");
    expect(mascararDinheiro("150")).toBe("1,50");
    expect(mascararDinheiro("150000")).toBe("1.500,00");
    expect(mascararDinheiro("123456789")).toBe("1.234.567,89");
  });

  it("vazio e zeros", () => {
    expect(mascararDinheiro("")).toBe("");
    expect(mascararDinheiro("0")).toBe("0,00");
    expect(mascararDinheiro("000")).toBe("0,00");
  });

  it("ignora não-dígitos (aceita colar 1.500,00)", () => {
    expect(mascararDinheiro("1.500,00")).toBe("1.500,00");
    expect(mascararDinheiro("R$ 2.000,00")).toBe("2.000,00");
  });
});

describe("mascararDocumento (CPF/CNPJ automático)", () => {
  it("CPF até 11 dígitos", () => {
    expect(mascararDocumento("123")).toBe("123");
    expect(mascararDocumento("1234")).toBe("123.4");
    expect(mascararDocumento("12345678901")).toBe("123.456.789-01");
  });

  it("CNPJ a partir do 12º dígito", () => {
    expect(mascararDocumento("123456789012")).toBe("12.345.678/9012");
    expect(mascararDocumento("12345678901234")).toBe("12.345.678/9012-34");
  });

  it("limita a 14 dígitos e limpa lixo", () => {
    expect(mascararDocumento("12.345.678/9012-34xx99")).toBe("12.345.678/9012-34");
    expect(mascararDocumento("")).toBe("");
  });
});

describe("mascararTelefone (fixo 10 / celular 11)", () => {
  it("formata progressivamente", () => {
    expect(mascararTelefone("4")).toBe("(4");
    expect(mascararTelefone("41")).toBe("(41");
    expect(mascararTelefone("418")).toBe("(41) 8");
    expect(mascararTelefone("4184891365")).toBe("(41) 8489-1365");
    expect(mascararTelefone("41984891365")).toBe("(41) 98489-1365");
  });

  it("limita a 11 dígitos e limpa lixo", () => {
    expect(mascararTelefone("41 98489-1365 ramal 2")).toBe("(41) 98489-1365");
    expect(mascararTelefone("")).toBe("");
  });
});
