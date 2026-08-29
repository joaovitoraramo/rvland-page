import { describe, expect, it } from "vitest";
import {
  distribuirPagamento,
  concatenarNota,
  mensagemClientes,
  mensagemLeads,
  parseComandoLead,
  mensagemLead,
  mensagemLicenca,
  parseComandoFatura,
  respostaFatura,
  type FaturaEmAberto,
} from "@/lib/dominio/telegram";

describe("parseComandoFatura", () => {
  it("aceita o comando completo", () => {
    const r = parseComandoFatura("/fatura a1b2c3d4 2.490,40 29/08/2026");
    expect(r).toEqual({
      ok: true,
      comando: { idCurto: "a1b2c3d4", valorCentavos: 249040, pagoEm: "2026-08-29" },
    });
  });

  it("data é opcional e o @ do bot é tolerado", () => {
    const r = parseComandoFatura("/fatura@rvlandcontact_bot A1B2C3D4 100,00");
    expect(r).toEqual({
      ok: true,
      comando: { idCurto: "a1b2c3d4", valorCentavos: 10000, pagoEm: null },
    });
  });

  it("aceita prefixo maior que 8 (com hífen de uuid)", () => {
    const r = parseComandoFatura("/fatura a1b2c3d4-e5f6 50,00");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.comando.idCurto).toBe("a1b2c3d4-e5f6");
  });

  it("rejeita id curto demais, valor e data inválidos", () => {
    expect(parseComandoFatura("/fatura abc 100,00").ok).toBe(false);
    expect(parseComandoFatura("/fatura a1b2c3d4 abc").ok).toBe(false);
    expect(parseComandoFatura("/fatura a1b2c3d4 100,00 31/02/2026").ok).toBe(false);
    expect(parseComandoFatura("/fatura").ok).toBe(false);
  });
});

describe("distribuirPagamento", () => {
  const fatura = (id: string, venc: string, valor: number, pago = 0): FaturaEmAberto => ({
    id,
    competencia: "2026-08-01",
    vencimento: venc,
    valorCentavos: valor,
    pagoCentavos: pago,
  });

  it("quita a mais antiga primeiro e deixa a seguinte parcial", () => {
    const r = distribuirPagamento(
      [fatura("b", "2026-09-15", 20000), fatura("a", "2026-08-15", 10000)],
      25000
    );
    expect(r.alocacoes).toEqual([
      { faturaId: "a", competencia: "2026-08-01", valorCentavos: 10000, quita: true },
      { faturaId: "b", competencia: "2026-08-01", valorCentavos: 15000, quita: false },
    ]);
    expect(r.sobraCentavos).toBe(0);
  });

  it("informa sobra quando o valor passa do total em aberto", () => {
    const r = distribuirPagamento([fatura("a", "2026-08-15", 10000)], 15000);
    expect(r.alocacoes[0]).toMatchObject({ faturaId: "a", valorCentavos: 10000, quita: true });
    expect(r.sobraCentavos).toBe(5000);
  });

  it("considera o que já foi pago na fatura", () => {
    const r = distribuirPagamento([fatura("a", "2026-08-15", 10000, 4000)], 6000);
    expect(r.alocacoes[0]).toMatchObject({ valorCentavos: 6000, quita: true });
  });

  it("sem faturas: tudo vira sobra", () => {
    const r = distribuirPagamento([], 5000);
    expect(r.alocacoes).toEqual([]);
    expect(r.sobraCentavos).toBe(5000);
  });
});

describe("mensagens", () => {
  it("lead traz origem, negócio, canal e contato", () => {
    const m = mensagemLead({
      origem: "en",
      nome: "John",
      negocio: "Sparkle Car Wash",
      canal: "SMS",
      contato: "5551234567",
      mensagem: "I want a new website.",
    });
    expect(m).toContain("Lead EN");
    expect(m).toContain("Sparkle Car Wash");
    expect(m).toContain("SMS: 5551234567");
    expect(m).toContain("I want a new website.");
  });

  it("licença atrasada inclui id curto e dica do comando", () => {
    const m = mensagemLicenca({
      nome: "Credit Recover",
      idCurto: "a1b2c3d4",
      novo: "atrasado",
      venceEm: "2026-09-15",
      toleradoAte: "2026-09-19",
    });
    expect(m).toContain("ATRASADO");
    expect(m).toContain("a1b2c3d4");
    expect(m).toContain("15/09/2026");
    expect(m).toContain("/fatura a1b2c3d4");
  });

  it("recuperação usa tom de em dia", () => {
    const m = mensagemLicenca({
      nome: "Credit Recover",
      idCurto: "a1b2c3d4",
      novo: "em_dia",
      venceEm: "2026-10-15",
      toleradoAte: null,
    });
    expect(m).toContain("EM DIA");
  });

  it("resposta do /fatura lista alocações, sobra e licença", () => {
    const m = respostaFatura({
      clienteNome: "Credit Recover",
      alocacoes: [
        { faturaId: "a", competencia: "2026-08-01", valorCentavos: 249040, quita: true },
      ],
      sobraCentavos: 1000,
      licenca: { status: "em_dia", venceEm: "2026-10-15", toleradoAte: null },
    });
    expect(m).toContain("08/2026");
    expect(m).toContain("quitada");
    expect(m).toContain("Sobra");
    expect(m).toContain("em dia");
  });
});

describe("mensagemClientes", () => {
  const cliente = (n: number): import("@/lib/dominio/telegram").ClienteResumo => ({
    id: `0000000${n}-aaaa-bbbb-cccc-dddddddddddd`.slice(-36),
    nome: `Cliente ${n}`,
    licenca: "em_dia",
    faturas: [],
  });

  it("lista nome, status, uuid do cliente e das faturas", () => {
    const chunks = mensagemClientes([
      {
        id: "a1b2c3d4-1111-2222-3333-444444444444",
        nome: "Credit Recover",
        licenca: "atrasado",
        faturas: [
          {
            id: "f0f1f2f3-5555-6666-7777-888888888888",
            competencia: "2026-08-01",
            valorCentavos: 249040,
            vencimento: "2026-08-15",
          },
        ],
      },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("Credit Recover");
    expect(chunks[0]).toContain("atrasado");
    expect(chunks[0]).toContain("a1b2c3d4-1111-2222-3333-444444444444");
    expect(chunks[0]).toContain("f0f1f2f3-5555-6666-7777-888888888888");
    expect(chunks[0]).toContain("08/2026");
    expect(chunks[0]).toContain("15/08/2026");
  });

  it("marca cliente sem faturas em aberto", () => {
    const chunks = mensagemClientes([{ ...cliente(1), nome: "Zen Ltda" }]);
    expect(chunks[0]).toContain("Zen Ltda");
    expect(chunks[0]).toContain("sem faturas em aberto");
  });

  it("quebra em várias mensagens quando estoura o limite", () => {
    const muitos = Array.from({ length: 80 }, (_, i) => cliente(i));
    const chunks = mensagemClientes(muitos);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(3800);
  });

  it("lista vazia tem mensagem própria", () => {
    expect(mensagemClientes([])).toEqual(["Nenhum cliente ativo."]);
  });
});

describe("parseComandoLead", () => {
  it("aceita status e nota multilinha", () => {
    const r = parseComandoLead("/lead a1b2c3d4 proposta Mandei o preview.\nEle gostou.");
    expect(r).toEqual({
      ok: true,
      comando: { idCurto: "a1b2c3d4", status: "proposta", nota: "Mandei o preview.\nEle gostou." },
    });
  });

  it("nota é opcional", () => {
    const r = parseComandoLead("/lead a1b2c3d4 ganho");
    expect(r).toEqual({ ok: true, comando: { idCurto: "a1b2c3d4", status: "ganho", nota: null } });
  });

  it("rejeita status desconhecido, id inválido e comando incompleto", () => {
    expect(parseComandoLead("/lead a1b2c3d4 fechado").ok).toBe(false);
    expect(parseComandoLead("/lead abc proposta").ok).toBe(false);
    expect(parseComandoLead("/lead").ok).toBe(false);
  });
});

describe("concatenarNota", () => {
  it("acrescenta com carimbo, nunca substitui", () => {
    expect(concatenarNota("Já conversamos.", "Fechou!", "29/08/2026")).toBe(
      "Já conversamos.\n\n[29/08/2026 · telegram] Fechou!"
    );
  });

  it("sem notas atuais, entra só a nova", () => {
    expect(concatenarNota(null, "Primeira nota", "29/08/2026")).toBe(
      "[29/08/2026 · telegram] Primeira nota"
    );
    expect(concatenarNota("  ", "Oi", "29/08/2026")).toBe("[29/08/2026 · telegram] Oi");
  });
});

describe("mensagemLeads", () => {
  it("lista nome, negócio, status, id curto e a dica do comando", () => {
    const chunks = mensagemLeads([
      {
        id: "a1b2c3d4-1111-2222-3333-444444444444",
        nome: "John",
        negocio: "Sparkle Car Wash",
        origem: "en",
        canal: "SMS",
        contato: "5551234567",
        status: "novo",
        criadoEm: new Date("2026-08-29T19:40:00Z"),
      },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("John");
    expect(chunks[0]).toContain("Sparkle Car Wash");
    expect(chunks[0]).toContain("Novo");
    expect(chunks[0]).toContain("id: a1b2c3d4");
    expect(chunks[0]).toContain("/lead");
    expect(chunks[0]).toContain("Status: novo · em_conversa · proposta · ganho · perdido");
  });

  it("vazio tem mensagem própria", () => {
    expect(mensagemLeads([])).toEqual(["Nenhum lead em aberto."]);
  });

  it("quebra em várias mensagens quando estoura", () => {
    const muitos = Array.from({ length: 120 }, (_, i) => ({
      id: `${String(i).padStart(8, "0")}-aaaa-bbbb-cccc-dddddddddddd`,
      nome: `Lead ${i}`,
      negocio: null,
      origem: "br" as const,
      canal: "WhatsApp",
      contato: "41999999999",
      status: "novo" as const,
      criadoEm: new Date(),
    }));
    const chunks = mensagemLeads(muitos);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
