import { describe, expect, it } from "vitest";
import {
  agrupar,
  ETAPAS_FUNIL,
  linkContatoProspect,
  parseCsvProspeccao,
  ROTULO_STATUS_PROSPECT,
  temperaturaDe,
  type ProspectResumo,
} from "@/lib/dominio/prospeccao";

const CSV = `potencial,negocio,nicho,cidade,perfil_cidade,site,nota_site,builder,booking,ano_copyright,instagram,seguidores_ig,emails,diagnostico_site,como_abordar,screenshot
"10","AZ Pool Guys","piscina","Scottsdale, AZ","Afluente","azpoolguys.com","2","sob medida","nao","2005","","","","clipart de 2005","ache no Maps","prospeccao/fotos/azpoolguys.com.png"
"3","Big Chain","car wash","Tampa, FL","Média","bigchain.com","7","WordPress","sim","2026","@bigchain","2,433","a@b.com / c@d.com","site moderno","nao abordar","prospeccao/fotos/bigchain.com.png"`;

describe("parseCsvProspeccao", () => {
  it("lê linhas com aspas, vírgulas internas e converte números", () => {
    const { linhas, erros } = parseCsvProspeccao(CSV);
    expect(erros).toEqual([]);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({
      dominio: "azpoolguys.com",
      negocio: "AZ Pool Guys",
      cidade: "Scottsdale, AZ",
      perfilCidade: "Afluente",
      potencial: 10,
      notaSite: 2,
      temBooking: false,
      instagram: null,
      seguidores: null,
    });
    expect(linhas[1]).toMatchObject({
      dominio: "bigchain.com",
      instagram: "@bigchain",
      seguidores: 2433,
      temBooking: true,
      emails: "a@b.com / c@d.com",
    });
  });

  it("converte sufixo K de seguidores", () => {
    const csv = CSV.replace('"2,433"', '"11K"');
    expect(parseCsvProspeccao(csv).linhas[1].seguidores).toBe(11000);
  });

  it("acusa cabeçalho faltando em vez de importar lixo", () => {
    const { linhas, erros } = parseCsvProspeccao("nome,cidade\nx,y");
    expect(linhas).toEqual([]);
    expect(erros[0]).toMatch(/coluna/i);
  });

  it("ignora linhas sem domínio", () => {
    const csv = CSV + '\n"5","Sem site","x","y","Média","","3","","nao","","","","","","",""';
    expect(parseCsvProspeccao(csv).linhas).toHaveLength(2);
  });
});

describe("temperaturaDe", () => {
  it("classifica pelas faixas do funil", () => {
    expect(temperaturaDe(10)).toBe("quente");
    expect(temperaturaDe(8)).toBe("quente");
    expect(temperaturaDe(7)).toBe("morno");
    expect(temperaturaDe(6)).toBe("morno");
    expect(temperaturaDe(5)).toBe("frio");
    expect(temperaturaDe(1)).toBe("frio");
  });
});

describe("agrupar", () => {
  const base = (over: Partial<ProspectResumo>): ProspectResumo => ({
    nicho: "piscina",
    cidade: "Scottsdale, AZ",
    perfilCidade: "Afluente",
    potencial: 9,
    status: "novo",
    seguidores: 100,
    ...over,
  });

  it("conta por chave e ordena do maior para o menor", () => {
    const r = agrupar(
      [base({ nicho: "piscina" }), base({ nicho: "med spa" }), base({ nicho: "piscina" })],
      (p) => p.nicho
    );
    expect(r).toEqual([
      { rotulo: "piscina", qtd: 2 },
      { rotulo: "med spa", qtd: 1 },
    ]);
  });

  it("devolve vazio sem estourar", () => {
    expect(agrupar([], (p) => p.nicho)).toEqual([]);
  });
});

describe("funil", () => {
  it("tem as etapas na ordem comercial e todas com rótulo", () => {
    expect(ETAPAS_FUNIL[0]).toBe("novo");
    expect(ETAPAS_FUNIL).toContain("contatado");
    expect(ETAPAS_FUNIL[ETAPAS_FUNIL.length - 1]).toBe("perdido");
    for (const e of ETAPAS_FUNIL) expect(ROTULO_STATUS_PROSPECT[e]).toBeTruthy();
  });
});

describe("linkContatoProspect", () => {
  it("monta site, instagram e mailto do primeiro e-mail", () => {
    expect(linkContatoProspect.site("a.com")).toBe("https://a.com");
    expect(linkContatoProspect.site("https://a.com")).toBe("https://a.com");
    expect(linkContatoProspect.instagram("@ze")).toBe("https://instagram.com/ze");
    expect(linkContatoProspect.email("a@b.com / c@d.com")).toBe("mailto:a@b.com");
    expect(linkContatoProspect.email(null)).toBeNull();
  });
});
