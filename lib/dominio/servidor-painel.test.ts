import { describe, expect, it } from "vitest";

import { capacidadesServidorPainel } from "./servidor-painel";

const tudo = { ativo: true, podeExecutar: true };

describe("capacidadesServidorPainel", () => {
  it("servidor do Credit ativo: tudo disponível (regressão)", () => {
    expect(capacidadesServidorPainel({ ehHermes: false, ...tudo })).toEqual({
      mostrarModulos: true,
      mostrarServicos: true,
      mostrarComandos: true,
      mostrarCartaoHermes: false,
    });
  });

  it("servidor Hermes: sem módulos, serviços nem comandos (Start/Stop), com o cartão Hermes", () => {
    expect(capacidadesServidorPainel({ ehHermes: true, ...tudo })).toEqual({
      mostrarModulos: false,
      mostrarServicos: false,
      mostrarComandos: false,
      mostrarCartaoHermes: true,
    });
  });

  it("comandos só com servidor ativo e permissão, e nunca no Hermes", () => {
    expect(capacidadesServidorPainel({ ehHermes: false, ativo: false, podeExecutar: true }).mostrarComandos).toBe(false);
    expect(capacidadesServidorPainel({ ehHermes: false, ativo: true, podeExecutar: false }).mostrarComandos).toBe(false);
    expect(capacidadesServidorPainel({ ehHermes: true, ativo: true, podeExecutar: true }).mostrarComandos).toBe(false);
  });
});
