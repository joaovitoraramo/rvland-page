import { describe, expect, it } from "vitest";
import { dolaresParaCentavos, formatarDolares } from "@/lib/formato";

describe("formatarDolares", () => {
  it("omite centavos zerados", () => {
    expect(formatarDolares(149700)).toBe("$1,497");
    expect(formatarDolares(7900)).toBe("$79");
  });

  it("mostra centavos quando existem", () => {
    expect(formatarDolares(7950)).toBe("$79.50");
  });
});

describe("dolaresParaCentavos", () => {
  it("aceita formato US com milhar", () => {
    expect(dolaresParaCentavos("1,497.00")).toBe(149700);
  });

  it("aceita inteiro seco", () => {
    expect(dolaresParaCentavos("299")).toBe(29900);
  });

  it("rejeita lixo", () => {
    expect(dolaresParaCentavos("abc")).toBeNaN();
    expect(dolaresParaCentavos("")).toBeNaN();
  });
});
