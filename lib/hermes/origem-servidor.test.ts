import { describe, it, expect } from "vitest";

import { criadoPorChave, foiCriadaPorChave } from "./origem-servidor";

describe("origem do servidor Hermes (marca sem coluna nova)", () => {
  it("criadoPorChave grava `chave:<prefixo>` e foiCriadaPorChave o reconhece", () => {
    expect(criadoPorChave("hmk_abcd1234")).toBe("chave:hmk_abcd1234");
    expect(foiCriadaPorChave(criadoPorChave("hmk_abcd1234"))).toBe(true);
  });

  it("qualquer outra origem (admin, vazio, nulo, prefixo no meio) NÃO é Hermes", () => {
    for (const v of [null, undefined, "", "joao", "admin:chave:x", "Chave:x", "chave", " chave:x"]) {
      expect(foiCriadaPorChave(v), String(v)).toBe(false);
    }
  });
});
