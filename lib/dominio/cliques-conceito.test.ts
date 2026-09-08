import { describe, expect, it } from "vitest";

import {
  agruparPorSessao,
  dominioDoDestino,
  limparItens,
  linhaDoClique,
  maisClicados,
  mensagemCliques,
  type CliqueConceito,
} from "./cliques-conceito";

function clique(p: Partial<CliqueConceito> & { rotulo: string }): CliqueConceito {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    slug: "sculpted",
    visitante: "v1",
    sessao: "s1",
    quando: new Date("2026-09-08T14:30:00Z"),
    secao: null,
    destino: null,
    ...p,
  };
}

describe("limparItens", () => {
  it("compacta espaços, corta no máximo e descarta rótulo vazio", () => {
    const itens = limparItens([
      { rotulo: "  Book a   free\n consultation ", secao: " hero ", destino: null },
      { rotulo: "   ", secao: null, destino: null },
      { rotulo: "x".repeat(200), secao: null, destino: "https://a.com/" + "y".repeat(400) },
    ]);
    expect(itens).toHaveLength(2);
    expect(itens[0]).toEqual({ rotulo: "Book a free consultation", secao: "hero", destino: null });
    expect(itens[1].rotulo).toHaveLength(80);
    expect(itens[1].rotulo.endsWith("…")).toBe(true);
    expect(itens[1].destino).toHaveLength(300);
  });

  it("limita o lote a 30 itens", () => {
    const muitos = Array.from({ length: 50 }, (_, i) => ({ rotulo: `c${i}`, secao: null, destino: null }));
    expect(limparItens(muitos)).toHaveLength(30);
  });
});

describe("dominioDoDestino", () => {
  it("devolve o domínio sem www para links externos e null para o resto", () => {
    expect(dominioDoDestino("https://www.sculptedcontours.com/body/")).toBe("sculptedcontours.com");
    expect(dominioDoDestino("tel:+14048728578")).toBeNull();
    expect(dominioDoDestino("#contact")).toBeNull();
    expect(dominioDoDestino(null)).toBeNull();
    expect(dominioDoDestino("isso não é url")).toBeNull();
  });
});

describe("linhaDoClique", () => {
  it("marca link externo, ligação e e-mail, e a seção entre colchetes", () => {
    expect(
      linhaDoClique({ rotulo: "CoolSculpting Elite", secao: "mega-menu", destino: "https://sculptedcontours.com/body/coolsculpting/" })
    ).toBe("• CoolSculpting Elite → sculptedcontours.com [mega-menu]");
    expect(linhaDoClique({ rotulo: "404.872.8578", secao: "nav", destino: "tel:+14048728578" })).toBe("• 404.872.8578 (ligar) [nav]");
    expect(linhaDoClique({ rotulo: "Contact", secao: "nav", destino: "https://rvland-page.vercel.app/c/sculpted#contact" }, "rvland-page.vercel.app")).toBe("• Contact [nav]");
    expect(linhaDoClique({ rotulo: "Start over", secao: null, destino: null })).toBe("• Start over");
  });
});

describe("mensagemCliques", () => {
  it("um clique vira uma mensagem curta com o negócio, o slug e a origem", () => {
    const m = mensagemCliques({
      negocio: "Sculpted Contours",
      slug: "sculpted",
      itens: [{ rotulo: "Book a free consultation", secao: "hero", destino: "https://sculptedcontours.com/contact/schedule-consultation/" }],
      visita: { dispositivo: "celular", sistema: "iPhone", cidade: "Alpharetta", pais: "US" },
      totalNaSessao: 1,
    });
    expect(m).toBe(
      [
        "🖱 Clicou no conceito — Sculpted Contours",
        "/c/sculpted",
        "• Book a free consultation → sculptedcontours.com [hero]",
        "de: celular · iPhone · Alpharetta, US",
      ].join("\n")
    );
  });

  it("um lote vira uma lista na ordem, com o total da sessão quando já havia cliques antes", () => {
    const m = mensagemCliques({
      negocio: "Poolguys",
      slug: "poolguys",
      itens: [
        { rotulo: "Services", secao: "nav", destino: null },
        { rotulo: "Get a free quote", secao: "hero", destino: null },
      ],
      visita: null,
      totalNaSessao: 5,
    });
    expect(m.split("\n")).toEqual([
      "🖱 Navegou no conceito (2 cliques) — Poolguys",
      "/c/poolguys",
      "• Services [nav]",
      "• Get a free quote [hero]",
      "nesta visita: 5 cliques no total",
    ]);
  });

  it("não usa marcação: o bot envia sem parse_mode", () => {
    const m = mensagemCliques({ negocio: "X", slug: "x", itens: [{ rotulo: "a", secao: null, destino: null }], visita: null, totalNaSessao: 1 });
    expect(m).not.toMatch(/[*_`<]/);
  });
});

describe("agruparPorSessao", () => {
  it("agrupa por sessão, ordena cliques por hora e sessões da mais recente", () => {
    const grupos = agruparPorSessao([
      clique({ rotulo: "b", sessao: "s1", quando: new Date("2026-09-08T14:31:00Z") }),
      clique({ rotulo: "a", sessao: "s1", quando: new Date("2026-09-08T14:30:00Z") }),
      clique({ rotulo: "c", sessao: "s2", visitante: "v2", quando: new Date("2026-09-09T10:00:00Z") }),
    ]);
    expect(grupos.map((g) => g.sessao)).toEqual(["s2", "s1"]);
    expect(grupos[1].cliques.map((c) => c.rotulo)).toEqual(["a", "b"]);
    expect(grupos[1].primeiro.toISOString()).toBe("2026-09-08T14:30:00.000Z");
    expect(grupos[1].ultimo.toISOString()).toBe("2026-09-08T14:31:00.000Z");
  });
});

describe("maisClicados", () => {
  it("conta vezes e pessoas diferentes, sem diferenciar maiúsculas", () => {
    const top = maisClicados([
      clique({ rotulo: "Book a free consultation", visitante: "v1" }),
      clique({ rotulo: "book a free consultation", visitante: "v2" }),
      clique({ rotulo: "Treatments", visitante: "v1" }),
    ]);
    expect(top[0]).toEqual({ rotulo: "Book a free consultation", vezes: 2, pessoas: 2 });
    expect(top[1]).toEqual({ rotulo: "Treatments", vezes: 1, pessoas: 1 });
  });
});
