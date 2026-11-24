import { describe, it, expect } from "vitest";
import {
  gerarChaveHermes,
  hashChaveHermes,
  formatoChaveValido,
  expiraEmChave,
  VALIDADE_CHAVE_HORAS,
} from "./chave";

describe("chave de instalação/adoção", () => {
  it("gera chave aleatória com >= 128 bits, hash sha256 e prefixo curto", () => {
    const a = gerarChaveHermes();
    const b = gerarChaveHermes();
    expect(a.chave).not.toBe(b.chave);
    // hmk_ + 43 chars base64url = 32 bytes (256 bits)
    expect(a.chave).toMatch(/^hmk_[A-Za-z0-9_-]{43}$/);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(hashChaveHermes(a.chave));
    expect(a.prefixo).toBe(a.chave.slice(0, 8));
    expect(a.prefixo.length).toBeLessThanOrEqual(8);
    // o hash/prefixo não contêm a chave inteira
    expect(a.hash).not.toContain(a.chave);
  });

  it("valida o formato antes de qualquer consulta", () => {
    expect(formatoChaveValido(gerarChaveHermes().chave)).toBe(true);
    expect(formatoChaveValido("hmk_curta")).toBe(false);
    expect(formatoChaveValido("")).toBe(false);
    expect(formatoChaveValido("x".repeat(500))).toBe(false);
    expect(formatoChaveValido(123 as unknown as string)).toBe(false);
  });

  it("validade padrão: instalação 12 h, adoção 24 h", () => {
    expect(VALIDADE_CHAVE_HORAS).toEqual({ instalacao: 12, adocao: 24 });
    const agora = new Date("2026-11-23T10:00:00.000Z");
    expect(expiraEmChave("instalacao", agora).toISOString()).toBe("2026-11-23T22:00:00.000Z");
    expect(expiraEmChave("adocao", agora).toISOString()).toBe("2026-11-24T10:00:00.000Z");
  });
});

import { novoProtocolo } from "./chave";

describe("protocolo de solicitação", () => {
  it("HP-XXXXXX com alfabeto sem ambiguidade (sem 0/O/1/I)", () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = novoProtocolo();
      expect(p).toMatch(/^HP-[A-HJ-NP-Z2-9]{6}$/);
      vistos.add(p);
    }
    expect(vistos.size).toBeGreaterThan(190);
  });
});
