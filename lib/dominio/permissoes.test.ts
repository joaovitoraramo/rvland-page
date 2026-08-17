import { describe, it, expect } from "vitest";
import { PERMISSOES, temPermissao, permissoesPorArea } from "./permissoes";

describe("catálogo", () => {
  it("tem as permissões centrais das Fases 0–1", () => {
    const chaves = PERMISSOES.map((p) => p.chave);
    for (const esperada of [
      "clientes.ver",
      "contratos.ver",
      "financeiro.ver",
      "financeiro.lancar_pagamento",
      "financeiro.alterar_preco",
      "licencas.conceder_confianca",
      "licencas.bloquear",
      "plataforma.panico",
      "plataforma.grupos",
      "plataforma.usuarios",
      "plataforma.auditoria",
    ]) {
      expect(chaves).toContain(esperada);
    }
  });

  it("não tem chaves duplicadas", () => {
    const chaves = PERMISSOES.map((p) => p.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("agrupa por área para a tela de grupos", () => {
    const areas = permissoesPorArea();
    expect(Object.keys(areas)).toContain("Financeiro");
    expect(areas["Financeiro"].some((p) => p.chave === "financeiro.ver")).toBe(true);
  });
});

describe("temPermissao", () => {
  it("todasPermissoes ignora o conjunto", () => {
    const dono = { todasPermissoes: true, permissoes: new Set<string>() };
    expect(temPermissao(dono, "financeiro.ver")).toBe(true);
    expect(temPermissao(dono, "plataforma.panico")).toBe(true);
  });

  it("sem a flag, exige a chave no conjunto", () => {
    const operacao = {
      todasPermissoes: false,
      permissoes: new Set(["clientes.ver", "licencas.bloquear"]),
    };
    expect(temPermissao(operacao, "clientes.ver")).toBe(true);
    expect(temPermissao(operacao, "financeiro.ver")).toBe(false);
    expect(temPermissao(operacao, "contratos.ver")).toBe(false);
  });
});
