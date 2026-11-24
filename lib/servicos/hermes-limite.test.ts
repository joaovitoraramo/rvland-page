import { describe, it, expect } from "vitest";
import { repoLimitesMemoria } from "./hermes-memoria";
import { consumirLimite, excedeuLimite, registrarOcorrencia, janelaDe } from "./hermes-limite";

const H = 3600_000;

describe("rate limit (hermes_limites)", () => {
  it("janela alinhada ao múltiplo do tamanho", () => {
    const j = janelaDe(new Date("2026-11-23T10:37:12.000Z"), H);
    expect(j.toISOString()).toBe("2026-11-23T10:00:00.000Z");
  });

  it("permite até o máximo e bloqueia o seguinte", async () => {
    const repo = repoLimitesMemoria();
    const agora = new Date("2026-11-23T10:10:00.000Z");
    for (let i = 0; i < 30; i++) {
      expect((await consumirLimite(repo, "k", 30, H, agora)).permitido).toBe(true);
    }
    const r = await consumirLimite(repo, "k", 30, H, agora);
    expect(r.permitido).toBe(false);
    expect(r.contagem).toBe(31);
  });

  it("zera na janela seguinte e isola por chave", async () => {
    const repo = repoLimitesMemoria();
    const t1 = new Date("2026-11-23T10:10:00.000Z");
    const t2 = new Date("2026-11-23T11:00:01.000Z");
    await consumirLimite(repo, "a", 1, H, t1);
    expect((await consumirLimite(repo, "a", 1, H, t1)).permitido).toBe(false);
    expect((await consumirLimite(repo, "b", 1, H, t1)).permitido).toBe(true);
    expect((await consumirLimite(repo, "a", 1, H, t2)).permitido).toBe(true);
  });

  it("falhas: excedeu só depois de registrar N ocorrências", async () => {
    const repo = repoLimitesMemoria();
    const agora = new Date("2026-11-23T10:10:00.000Z");
    for (let i = 0; i < 9; i++) await registrarOcorrencia(repo, "ip", H, agora);
    expect(await excedeuLimite(repo, "ip", 10, H, agora)).toBe(false);
    await registrarOcorrencia(repo, "ip", H, agora);
    expect(await excedeuLimite(repo, "ip", 10, H, agora)).toBe(true);
  });
});
