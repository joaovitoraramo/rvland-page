import { describe, it, expect } from "vitest";
import { parseConfigHermes, montarEnforcement, OFFLINE_HORAS_CONFIG_PADRAO } from "./config-valores";

describe("config Hermes (valores)", () => {
  it("padrões: enforcement desligado, 72 h offline, sem avisos", () => {
    const c = parseConfigHermes({});
    expect(c.enforcement).toEqual({ ativo: false, ligado_em: null, ligado_por: null, motivo: null });
    expect(c.offlineHoras).toBe(72);
    expect(OFFLINE_HORAS_CONFIG_PADRAO).toBe(72);
    expect(c.avisos).toEqual({});
  });

  it("lê as três chaves e ignora lixo", () => {
    const c = parseConfigHermes({
      hermes_enforcement: { ativo: true, ligado_em: "2026-12-01T00:00:00.000Z", ligado_por: "joao", motivo: "ok" },
      hermes_offline_horas: { horas: 48 },
      hermes_avisos: { d7: ["abc"] },
    });
    expect(c.enforcement.ativo).toBe(true);
    expect(c.enforcement.ligado_por).toBe("joao");
    expect(c.offlineHoras).toBe(48);
    expect(c.avisos).toEqual({ d7: ["abc"] });

    const ruim = parseConfigHermes({
      hermes_enforcement: { ativo: "sim" } as never,
      hermes_offline_horas: { horas: -5 },
    });
    expect(ruim.enforcement.ativo).toBe(false);
    expect(ruim.offlineHoras).toBe(0);
    expect(parseConfigHermes({ hermes_offline_horas: { horas: "x" } as never }).offlineHoras).toBe(72);
    expect(parseConfigHermes({ hermes_offline_horas: { horas: 999999 } }).offlineHoras).toBe(720);
  });

  it("montarEnforcement carimba quem ligou e quando", () => {
    const agora = new Date("2026-12-01T12:00:00.000Z");
    expect(montarEnforcement({ ativo: true, por: "joao", motivo: "checklist ok" }, agora)).toEqual({
      ativo: true,
      ligado_em: agora.toISOString(),
      ligado_por: "joao",
      motivo: "checklist ok",
    });
    expect(montarEnforcement({ ativo: false, por: "joao", motivo: "rollback" }, agora).ativo).toBe(false);
  });
});
