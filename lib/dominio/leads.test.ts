import { describe, expect, it } from "vitest";
import {
  esquemaLead,
  linkContato,
  normalizarLead,
  type LeadEntrada,
} from "@/lib/dominio/leads";

const baseEn: LeadEntrada = {
  origem: "en",
  nome: "John",
  canal: "sms",
  contato: "5551234567",
  mensagem: "I want a new website for my car wash.",
};

describe("esquemaLead", () => {
  it("aceita lead EN válido", () => {
    expect(esquemaLead.safeParse(baseEn).success).toBe(true);
  });

  it("rejeita canal fora da origem", () => {
    expect(esquemaLead.safeParse({ ...baseEn, canal: "whatsapp" }).success).toBe(false);
    expect(
      esquemaLead.safeParse({ ...baseEn, origem: "br", canal: "messenger" }).success
    ).toBe(false);
  });

  it("valida o contato conforme o canal", () => {
    expect(
      esquemaLead.safeParse({ ...baseEn, canal: "email", contato: "não é email" }).success
    ).toBe(false);
    expect(esquemaLead.safeParse({ ...baseEn, contato: "123" }).success).toBe(false);
  });
});

describe("normalizarLead", () => {
  it("extrai handle de URL e de @ do instagram", () => {
    expect(
      normalizarLead({ ...baseEn, canal: "instagram", contato: "https://instagram.com/mycarwash/" })
        .contato
    ).toBe("mycarwash");
    expect(
      normalizarLead({ ...baseEn, canal: "instagram", contato: "@mycarwash" }).contato
    ).toBe("mycarwash");
  });

  it("reduz telefones a dígitos", () => {
    const lead = normalizarLead({
      origem: "br",
      nome: "Ana",
      canal: "whatsapp",
      contato: "(41) 98489-1365",
      mensagem: "Quero um orçamento de site.",
    });
    expect(lead.contato).toBe("41984891365");
  });
});

describe("linkContato", () => {
  it("monta o link de cada canal", () => {
    expect(linkContato("email", "a@b.com")).toBe("mailto:a@b.com");
    expect(linkContato("sms", "5551234567")).toBe("sms:+15551234567");
    expect(linkContato("whatsapp", "41984891365")).toBe("https://wa.me/5541984891365");
    expect(linkContato("telefone", "4184891365")).toBe("tel:+554184891365");
    expect(linkContato("instagram", "mycarwash")).toBe("https://instagram.com/mycarwash");
    expect(linkContato("messenger", "mycarwash")).toBe("https://m.me/mycarwash");
  });
});

describe("planoInteresse", () => {
  it("aceita plano válido e rejeita desconhecido", () => {
    expect(esquemaLead.safeParse({ ...baseEn, planoInteresse: "m6" }).success).toBe(true);
    expect(esquemaLead.safeParse({ ...baseEn, planoInteresse: "anual" }).success).toBe(false);
  });
});
