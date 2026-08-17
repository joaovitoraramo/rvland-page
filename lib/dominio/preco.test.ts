import { describe, it, expect } from "vitest";
import { precoVigente } from "./preco";

const v = (valorCentavos: number, vigenteDesde: string) => ({ valorCentavos, vigenteDesde });

describe("precoVigente", () => {
  it("usa a única vigência quando anterior à competência", () => {
    expect(precoVigente([v(150000, "2026-01-01")], "2026-08-01")).toBe(150000);
  });

  it("vigência na própria competência vale", () => {
    expect(precoVigente([v(150000, "2026-08-01")], "2026-08-01")).toBe(150000);
  });

  it("escolhe a vigência mais recente que já começou", () => {
    const vigencias = [v(150000, "2026-01-01"), v(180000, "2026-06-01"), v(200000, "2026-12-01")];
    expect(precoVigente(vigencias, "2026-08-01")).toBe(180000);
    expect(precoVigente(vigencias, "2026-12-01")).toBe(200000);
    expect(precoVigente(vigencias, "2026-01-01")).toBe(150000);
  });

  it("ordem de entrada não importa", () => {
    const vigencias = [v(200000, "2026-12-01"), v(150000, "2026-01-01")];
    expect(precoVigente(vigencias, "2026-08-01")).toBe(150000);
  });

  it("nenhuma vigência aplicável → null", () => {
    expect(precoVigente([v(150000, "2026-09-01")], "2026-08-01")).toBeNull();
    expect(precoVigente([], "2026-08-01")).toBeNull();
  });
});
