import { describe, expect, it } from "vitest";

import {
  ESPERA_MINIMA_DIAS,
  JANELA_FOLLOW_UP,
  followUpsDevidos,
  mensagemFollowUps,
  proximoDiaUtilDeDisparo,
  type ProspectContatado,
} from "@/lib/dominio/follow-up";

const p = (over: Partial<ProspectContatado> = {}): ProspectContatado => ({
  id: "1",
  negocio: "Pool Service Company",
  dominio: "azpoolguys.com",
  emails: "poolguys@att.net",
  status: "contatado",
  contatadoEm: "2026-09-04",
  disparos: 1,
  ...over,
});

describe("followUpsDevidos", () => {
  it("não cobra antes da janela: insistir cedo demais queima o remetente", () => {
    expect(followUpsDevidos([p()], "2026-09-06")).toEqual([]);
    expect(followUpsDevidos([p()], "2026-09-08")).toEqual([]);
  });

  it("cobra a partir do 5º dia", () => {
    const r = followUpsDevidos([p()], "2026-09-09");
    expect(r).toHaveLength(1);
    expect(r[0].diasDesde).toBe(5);
  });

  it("continua cobrando depois da janela: atrasado ainda vale mais que esquecido", () => {
    expect(followUpsDevidos([p()], "2026-09-20")).toHaveLength(1);
  });

  it("para no segundo disparo: o terceiro contato vira incômodo", () => {
    expect(followUpsDevidos([p({ disparos: 2 })], "2026-09-09")).toEqual([]);
    expect(followUpsDevidos([p({ disparos: 5 })], "2026-09-30")).toEqual([]);
  });

  it("só cobra quem está em 'contatado'", () => {
    for (const status of ["novo", "respondeu", "negociando", "ganho", "perdido"] as const) {
      expect(followUpsDevidos([p({ status })], "2026-09-09")).toEqual([]);
    }
  });

  it("ignora quem não tem e-mail: não há como disparar", () => {
    expect(followUpsDevidos([p({ emails: null })], "2026-09-09")).toEqual([]);
    expect(followUpsDevidos([p({ emails: "  " })], "2026-09-09")).toEqual([]);
  });

  it("ignora sem data de contato, em vez de chutar", () => {
    expect(followUpsDevidos([p({ contatadoEm: null })], "2026-09-09")).toEqual([]);
  });

  it("ordena do mais antigo para o mais novo", () => {
    const r = followUpsDevidos(
      [
        p({ id: "novo", contatadoEm: "2026-09-04" }),
        p({ id: "antigo", contatadoEm: "2026-08-20" }),
      ],
      "2026-09-12"
    );
    expect(r.map((x) => x.id)).toEqual(["antigo", "novo"]);
  });

  it("marca quem passou da janela, para o aviso dizer a verdade", () => {
    const [dentro] = followUpsDevidos([p()], "2026-09-10");
    expect(dentro.atrasado).toBe(false);
    const [fora] = followUpsDevidos([p()], "2026-09-15");
    expect(fora.atrasado).toBe(true);
  });
});

describe("proximoDiaUtilDeDisparo", () => {
  it("empurra o fim de semana e a segunda para terça", () => {
    // a janela é terça a quinta: segunda o sujeito está cavando a semana
    expect(proximoDiaUtilDeDisparo("2026-09-04")).toBe("2026-09-08"); // sexta
    expect(proximoDiaUtilDeDisparo("2026-09-05")).toBe("2026-09-08"); // sábado
    expect(proximoDiaUtilDeDisparo("2026-09-06")).toBe("2026-09-08"); // domingo
    expect(proximoDiaUtilDeDisparo("2026-09-07")).toBe("2026-09-08"); // segunda
  });

  it("mantém terça, quarta e quinta", () => {
    expect(proximoDiaUtilDeDisparo("2026-09-08")).toBe("2026-09-08");
    expect(proximoDiaUtilDeDisparo("2026-09-09")).toBe("2026-09-09");
    expect(proximoDiaUtilDeDisparo("2026-09-10")).toBe("2026-09-10");
  });
});

describe("mensagemFollowUps", () => {
  it("some quando não há nada a cobrar", () => {
    expect(mensagemFollowUps([], "2026-09-09")).toBeNull();
  });

  it("diz o negócio, o e-mail e há quantos dias", () => {
    const t = mensagemFollowUps(followUpsDevidos([p()], "2026-09-09"), "2026-09-09")!;
    expect(t).toContain("Pool Service Company");
    expect(t).toContain("poolguys@att.net");
    expect(t).toContain("5 dias");
  });

  it("avisa que a resposta precisa ser conferida antes de insistir", () => {
    const t = mensagemFollowUps(followUpsDevidos([p()], "2026-09-09"), "2026-09-09")!;
    expect(t.toLowerCase()).toContain("respondeu");
  });
});

describe("constantes do protocolo", () => {
  it("mantém a janela combinada de 5 a 7 dias e o teto de 2 disparos", () => {
    expect(ESPERA_MINIMA_DIAS).toBe(5);
    expect(JANELA_FOLLOW_UP).toEqual([5, 7]);
  });
});
