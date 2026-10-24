import { describe, expect, it } from "vitest";

import { ajudaServico, normalizaNomeServicoWindows, normalizaSO, validarNomeServico } from "./servidor-so";

describe("SO do servidor", () => {
  it("normaliza o SO", () => {
    expect(normalizaSO("windows")).toBe("windows");
    expect(normalizaSO("Windows Server 2019 Standard")).toBe("windows");
    expect(normalizaSO("linux")).toBe("linux");
    expect(normalizaSO(null)).toBe("linux");
    expect(normalizaSO("")).toBe("linux");
  });

  it("ajuda do campo muda com o SO", () => {
    expect(ajudaServico("windows").ajuda).toContain("Gerenciador de Serviços");
    expect(ajudaServico("windows").exemplo).toBe("wildfly");
    expect(ajudaServico("linux").ajuda).toContain("credit-back.service");
  });
});

describe("nome do serviço licenciado", () => {
  it("Linux exige unidade systemd", () => {
    expect(validarNomeServico("credit-back.service", "linux")).toEqual({ ok: true, valor: "credit-back.service" });
    expect(validarNomeServico("wildfly", "linux").ok).toBe(false);
  });

  it("Windows aceita Service Name e Display Name, e tira .service", () => {
    expect(validarNomeServico("wildfly", "windows")).toEqual({ ok: true, valor: "wildfly" });
    expect(validarNomeServico("wildfly.service", "windows")).toEqual({ ok: true, valor: "wildfly" });
    expect(validarNomeServico("WildFly Application Server", "windows")).toEqual({
      ok: true,
      valor: "WildFly Application Server",
    });
    expect(validarNomeServico("c:\\wildfly", "windows").ok).toBe(false);
    expect(validarNomeServico("   ", "windows").ok).toBe(false);
    expect(normalizaNomeServicoWindows(".service")).toBe(".service");
  });
});
