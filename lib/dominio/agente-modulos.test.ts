import { describe, expect, it } from "vitest";

import { comandoInstalacao, descreverModulos, listaModulos, modulosDoForm } from "./agente-modulos";
import { montarLease } from "./lease";

describe("módulos do agente", () => {
  it("lista e descreve", () => {
    expect(listaModulos({ licenca: true, picprice: true })).toBe("licenca,picprice");
    expect(listaModulos({ licenca: false, picprice: true })).toBe("picprice");
    expect(listaModulos({ licenca: false, picprice: false })).toBe("nenhum");
    expect(descreverModulos({ licenca: true, picprice: true })).toBe("Licença e RV Pic Price");
    expect(descreverModulos({ licenca: false, picprice: true })).toBe("RV Pic Price");
  });

  it("lê checkboxes do formulário", () => {
    const f = new FormData();
    f.set("moduloPicprice", "on");
    expect(modulosDoForm(f)).toEqual({ licenca: false, picprice: true });
  });

  it("comando de instalação traz os módulos", () => {
    const c = comandoInstalacao({ siteUrl: "https://x", token: "T", modulos: { licenca: false, picprice: true } });
    expect(c).toContain("--token=T");
    expect(c).toContain("--modulos=picprice");
  });

  it("lease sem módulos informados = só licença (compatível com servidores antigos)", () => {
    const l = montarLease({
      servidorId: "s",
      clienteId: "c",
      hoje: "2026-10-24",
      licenca: { status: "sem_licenca", toleradoAte: null } as never,
      servicosLicenciados: [],
      modoSimulacao: false,
      modoPanico: false,
    });
    expect(l.modulos).toEqual({ licenca: true, picprice: false });
  });
});
