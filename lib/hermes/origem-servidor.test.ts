import { describe, it, expect } from "vitest";

import { criadoPorChave, criadoPorPainel, foiCriadaPorChave, PADRAO_LIKE_CRIADOR_CHAVE } from "./origem-servidor";

/** Emula o `LIKE` do Postgres para o padrão (só `%` e `_` são curingas; resto literal; sem ESCAPE). */
const like = (valor: string, padrao: string): boolean =>
  new RegExp(
    "^" +
      [...padrao].map((c) => (c === "%" ? ".*" : c === "_" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("") +
      "$",
    "s"
  ).test(valor);

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

  it("instalação criada pelo painel (`painel:<nome>`) NUNCA é tratada como servidor Hermes, nem com `chave:` no nome", () => {
    for (const nome of ["Ana", "chave:hmk_abcd1234", "chave:", "", " chave:x", "%"]) {
      const marca = criadoPorPainel(nome);
      expect(marca.startsWith("painel:"), nome).toBe(true);
      expect(foiCriadaPorChave(marca), nome).toBe(false);
      expect(like(marca, PADRAO_LIKE_CRIADOR_CHAVE), `like ${nome}`).toBe(false);
    }
  });

  it("o padrão SQL `LIKE` dos repositórios é equivalente a foiCriadaPorChave", () => {
    expect(PADRAO_LIKE_CRIADOR_CHAVE).toBe("chave:%");
    const amostras = [
      criadoPorChave("hmk_abcd1234"), "chave:", "chave:x", "chave:chave:x",
      criadoPorPainel("Ana"), criadoPorPainel("chave:x"), "painel:chave:x",
      "admin:chave:x", "Chave:x", "chave", " chave:x", "xchave:x", "", "joao",
    ];
    for (const v of amostras) expect(like(v, PADRAO_LIKE_CRIADOR_CHAVE), JSON.stringify(v)).toBe(foiCriadaPorChave(v));
  });
});
