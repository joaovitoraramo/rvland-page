import { z } from "zod";

/**
 * Leads dos formulários públicos (PT e EN). Os canais mudam por origem:
 * o mercado americano não recebe telefone (coerente com "no calls") e o
 * brasileiro não recebe SMS/Messenger.
 */
export const CANAIS_EN = ["email", "sms", "instagram", "messenger"] as const;
export const CANAIS_BR = ["whatsapp", "email", "instagram", "telefone"] as const;
export const TODOS_CANAIS = [
  "email",
  "sms",
  "instagram",
  "messenger",
  "whatsapp",
  "telefone",
] as const;

export type CanalLead = (typeof TODOS_CANAIS)[number];
export type OrigemLead = "br" | "en";

export const STATUS_LEAD = ["novo", "em_conversa", "proposta", "ganho", "perdido"] as const;
export type StatusLead = (typeof STATUS_LEAD)[number];

export const rotuloCanal: Record<CanalLead, string> = {
  email: "Email",
  sms: "SMS",
  instagram: "Instagram",
  messenger: "Messenger",
  whatsapp: "WhatsApp",
  telefone: "Telefone",
};

const CANAIS_POR_ORIGEM: Record<OrigemLead, readonly CanalLead[]> = {
  br: CANAIS_BR,
  en: CANAIS_EN,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CANAIS_TELEFONICOS: readonly CanalLead[] = ["sms", "whatsapp", "telefone"];

export const esquemaLead = z
  .object({
    origem: z.enum(["br", "en"]),
    nome: z.string().trim().min(2).max(160),
    negocio: z.string().trim().max(160).optional(),
    siteAtual: z.string().trim().max(300).optional(),
    canal: z.enum(TODOS_CANAIS),
    contato: z.string().trim().min(3).max(200),
    mensagem: z.string().trim().min(10).max(4000),
  })
  .superRefine((dados, ctx) => {
    if (!CANAIS_POR_ORIGEM[dados.origem].includes(dados.canal)) {
      ctx.addIssue({ code: "custom", path: ["canal"], message: "canal inválido para a origem" });
    }
    if (dados.canal === "email" && !EMAIL_RE.test(dados.contato)) {
      ctx.addIssue({ code: "custom", path: ["contato"], message: "email inválido" });
    }
    if (
      CANAIS_TELEFONICOS.includes(dados.canal) &&
      dados.contato.replace(/\D/g, "").length < 8
    ) {
      ctx.addIssue({ code: "custom", path: ["contato"], message: "telefone inválido" });
    }
  });

export type LeadEntrada = z.infer<typeof esquemaLead>;

/** Normaliza o contato: handle sem @/URL; canais telefônicos só dígitos. */
export function normalizarLead(dados: LeadEntrada): LeadEntrada {
  let contato = dados.contato.trim();

  if (dados.canal === "instagram" || dados.canal === "messenger") {
    contato = contato
      .replace(/^https?:\/\/(www\.)?(instagram\.com|m\.me|facebook\.com)\//i, "")
      .replace(/^@/, "")
      .replace(/\/+$/, "");
  }

  if (CANAIS_TELEFONICOS.includes(dados.canal)) {
    contato = contato.replace(/\D/g, "");
  }

  return {
    ...dados,
    contato,
    negocio: dados.negocio || undefined,
    siteAtual: dados.siteAtual || undefined,
  };
}

/** BR local (10–11 dígitos) ganha DDI 55; número já internacional passa direto. */
function telefoneBRComDDI(digitos: string): string {
  return digitos.length <= 11 ? `55${digitos}` : digitos;
}

/** Link clicável do painel para abrir o contato no canal escolhido. */
export function linkContato(canal: CanalLead, contato: string): string {
  switch (canal) {
    case "email":
      return `mailto:${contato}`;
    case "sms":
      // EN: 10 dígitos = número US local → +1
      return `sms:+${contato.length === 10 ? `1${contato}` : contato}`;
    case "whatsapp":
      return `https://wa.me/${telefoneBRComDDI(contato)}`;
    case "telefone":
      return `tel:+${telefoneBRComDDI(contato)}`;
    case "instagram":
      return `https://instagram.com/${contato}`;
    case "messenger":
      return `https://m.me/${contato}`;
  }
}
