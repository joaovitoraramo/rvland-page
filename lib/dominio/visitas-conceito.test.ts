import { describe, expect, it } from "vitest";

import {
  dispositivoDe,
  ehRobo,
  localDe,
  mensagemVisita,
  resumirVisitas,
  type VisitaConceito,
} from "@/lib/dominio/visitas-conceito";

const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1";
const UA_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const UA_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const UA_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

describe("ehRobo", () => {
  it("barra os varredores de link de e-mail, que é o falso positivo que importa", () => {
    // o provedor abre o link para escanear vírus minutos após o envio; contar
    // isso como visita faria a gente comemorar uma abertura que não houve
    expect(ehRobo("Mozilla/5.0 (compatible; YahooMailProxy; https://help.yahoo.com/)")).toBe(true);
    expect(ehRobo("Microsoft Office Outlook 16.0")).toBe(true);
    expect(ehRobo("Mozilla/5.0 (compatible; Barracuda Sentinel)")).toBe(true);
    expect(ehRobo("GoogleImageProxy")).toBe(true);
    expect(ehRobo("Mozilla/5.0 (compatible; Slackbot-LinkExpanding 1.0)")).toBe(true);
  });

  it("barra buscador, monitor e ferramenta de linha de comando", () => {
    expect(ehRobo("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(ehRobo("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(true);
    expect(ehRobo("HeadlessChrome/120.0.0.0")).toBe(true);
    expect(ehRobo("curl/8.4.0")).toBe(true);
    expect(ehRobo("python-requests/2.31.0")).toBe(true);
    expect(ehRobo("Vercel Edge Functions")).toBe(true);
  });

  it("deixa passar gente de verdade", () => {
    expect(ehRobo(UA_IPHONE)).toBe(false);
    expect(ehRobo(UA_ANDROID)).toBe(false);
    expect(ehRobo(UA_MAC)).toBe(false);
    expect(ehRobo(UA_WINDOWS)).toBe(false);
  });

  it("trata ausência de user agent como robô", () => {
    // navegador de verdade sempre manda; a falta é sinal de script
    expect(ehRobo("")).toBe(true);
    expect(ehRobo(null)).toBe(true);
    expect(ehRobo(undefined)).toBe(true);
  });
});

describe("dispositivoDe", () => {
  it("separa celular de computador", () => {
    expect(dispositivoDe(UA_IPHONE)).toEqual({ tipo: "celular", sistema: "iPhone" });
    expect(dispositivoDe(UA_ANDROID)).toEqual({ tipo: "celular", sistema: "Android" });
    expect(dispositivoDe(UA_MAC)).toEqual({ tipo: "computador", sistema: "Mac" });
    expect(dispositivoDe(UA_WINDOWS)).toEqual({ tipo: "computador", sistema: "Windows" });
  });

  it("reconhece tablet como tela grande", () => {
    const ipad =
      "Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/604.1";
    expect(dispositivoDe(ipad)).toEqual({ tipo: "tablet", sistema: "iPad" });
  });

  it("não inventa quando não reconhece", () => {
    expect(dispositivoDe("algo estranho")).toEqual({ tipo: "desconhecido", sistema: null });
  });
});

describe("localDe", () => {
  it("monta cidade e país quando os dois vêm", () => {
    expect(localDe({ cidade: "Scottsdale", pais: "US" })).toBe("Scottsdale, US");
  });

  it("aceita só o país", () => {
    expect(localDe({ cidade: null, pais: "US" })).toBe("US");
  });

  it("some quando não há nada", () => {
    expect(localDe({ cidade: null, pais: null })).toBeNull();
  });
});

const visita = (over: Partial<VisitaConceito> = {}): VisitaConceito => ({
  id: "v1",
  slug: "poolguys",
  visitante: "abc",
  sessao: "s1",
  quando: new Date("2026-09-04T21:30:00Z"),
  dispositivo: "celular",
  sistema: "iPhone",
  cidade: "Scottsdale",
  pais: "US",
  referencia: null,
  segundos: 45,
  ...over,
});

describe("mensagemVisita", () => {
  it("avisa a primeira abertura com o que importa para decidir o follow-up", () => {
    const texto = mensagemVisita({
      visita: visita(),
      negocio: "Pool Service Company",
      totalDoVisitante: 1,
    });
    expect(texto).toContain("Pool Service Company");
    expect(texto).toContain("poolguys");
    expect(texto).toContain("celular");
    expect(texto).toContain("Scottsdale, US");
  });

  it("destaca o retorno, que é o sinal de compra", () => {
    const texto = mensagemVisita({
      visita: visita({ segundos: 120 }),
      negocio: "Pool Service Company",
      totalDoVisitante: 3,
    });
    expect(texto).toMatch(/voltou|3ª|3ᵃ|3a/i);
  });

  it("mostra o tempo em minutos quando passa de um minuto", () => {
    const texto = mensagemVisita({
      visita: visita({ segundos: 135 }),
      negocio: "X",
      totalDoVisitante: 1,
    });
    expect(texto).toContain("2min");
  });
});

describe("resumirVisitas", () => {
  it("conta pessoas e aberturas separadamente", () => {
    const r = resumirVisitas([
      visita({ id: "1", visitante: "a" }),
      visita({ id: "2", visitante: "a" }),
      visita({ id: "3", visitante: "b" }),
    ]);
    expect(r.aberturas).toBe(3);
    expect(r.pessoas).toBe(2);
  });

  it("acha a última abertura", () => {
    const r = resumirVisitas([
      visita({ id: "1", quando: new Date("2026-09-01T10:00:00Z") }),
      visita({ id: "2", quando: new Date("2026-09-03T10:00:00Z") }),
    ]);
    expect(r.ultima?.id).toBe("2");
  });

  it("soma o tempo total de leitura", () => {
    const r = resumirVisitas([visita({ segundos: 30 }), visita({ segundos: 90 })]);
    expect(r.segundosTotais).toBe(120);
  });

  it("aguenta lista vazia sem quebrar o painel", () => {
    expect(resumirVisitas([])).toEqual({
      aberturas: 0,
      pessoas: 0,
      ultima: null,
      segundosTotais: 0,
      emCelular: 0,
    });
  });

  it("conta quantas aberturas foram no celular", () => {
    const r = resumirVisitas([
      visita({ dispositivo: "celular" }),
      visita({ dispositivo: "computador" }),
      visita({ dispositivo: "celular" }),
    ]);
    expect(r.emCelular).toBe(2);
  });
});
