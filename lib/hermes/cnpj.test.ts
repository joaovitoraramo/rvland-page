import { describe, it, expect } from "vitest";
import { cnpjValido, soDigitosCnpj, raizCnpj, mascararCnpjRaiz, cnpjsMesmaRaiz } from "./cnpj";

describe("cnpj", () => {
  it("aceita CNPJ com dígito verificador correto (com ou sem máscara)", () => {
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11444777000161")).toBe(true);
  });

  it("recusa dígito verificador errado, tamanho errado e repetidos", () => {
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
    expect(cnpjValido("112223330001810")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
    expect(cnpjValido("")).toBe(false);
    expect(cnpjValido("abc")).toBe(false);
  });

  it("extrai dígitos e raiz de 8", () => {
    expect(soDigitosCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(raizCnpj("11.222.333/0001-81")).toBe("11222333");
  });

  it("casa matriz e filial pela raiz", () => {
    // mesma raiz, filial 0002 (DV irrelevante para a comparação)
    expect(cnpjsMesmaRaiz("11222333000181", "11222333000262")).toBe(true);
    expect(cnpjsMesmaRaiz("11222333000181", "11444777000161")).toBe(false);
    expect(cnpjsMesmaRaiz("", "11444777000161")).toBe(false);
  });

  it("máscara mostra só a raiz", () => {
    expect(mascararCnpjRaiz("11222333000181")).toBe("11.222.333/****-**");
  });
});
