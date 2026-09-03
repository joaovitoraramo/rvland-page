/**
 * Prospecção outbound: funil comercial dos leads frios varridos nos EUA.
 *
 * Puro de propósito — o CSV é parseado, classificado e agregado aqui, e as
 * telas só desenham. Assim o formato do arquivo tem um lugar só para mudar.
 */

export const ETAPAS_FUNIL = [
  "novo",
  "seguindo",
  "comentou",
  "contatado",
  "respondeu",
  "previa",
  "negociando",
  "ganho",
  "perdido",
] as const;

export type StatusProspect = (typeof ETAPAS_FUNIL)[number];

export const ROTULO_STATUS_PROSPECT: Record<StatusProspect, string> = {
  novo: "Novo",
  seguindo: "Seguido",
  comentou: "Comentou",
  contatado: "Entrei em contato",
  respondeu: "Respondeu",
  previa: "Prévia enviada",
  negociando: "Negociando",
  ganho: "Ganho",
  perdido: "Perdido",
};

/** Etapas que contam como "trabalhado" — saiu da fila e virou conversa. */
export const ETAPAS_ATIVAS: readonly StatusProspect[] = [
  "contatado",
  "respondeu",
  "previa",
  "negociando",
];

export type Temperatura = "quente" | "morno" | "frio";

export function temperaturaDe(potencial: number): Temperatura {
  if (potencial >= 8) return "quente";
  if (potencial >= 6) return "morno";
  return "frio";
}

export type ProspectResumo = {
  nicho: string;
  cidade: string;
  perfilCidade: string;
  potencial: number;
  status: StatusProspect;
  seguidores: number | null;
};

export type Fatia = { rotulo: string; qtd: number };

/** Conta por chave e ordena do maior para o menor (séries dos gráficos). */
export function agrupar<T>(itens: T[], chave: (item: T) => string): Fatia[] {
  const mapa = new Map<string, number>();
  for (const item of itens) {
    const k = chave(item);
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([rotulo, qtd]) => ({ rotulo, qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.rotulo.localeCompare(b.rotulo));
}

export const linkContatoProspect = {
  site(dominio: string): string {
    return /^https?:\/\//i.test(dominio) ? dominio : `https://${dominio}`;
  },
  instagram(handle: string | null): string | null {
    if (!handle) return null;
    return `https://instagram.com/${handle.replace(/^@/, "")}`;
  },
  email(emails: string | null): string | null {
    if (!emails) return null;
    const primeiro = emails.split("/")[0]?.trim();
    return primeiro ? `mailto:${primeiro}` : null;
  },
  telefone(numero: string | null): string | null {
    if (!numero) return null;
    const jaTemDDI = numero.trim().startsWith("+");
    const digitos = numero.replace(/\D/g, "");
    if (digitos.length < 8) return null;
    // 10 dígitos sem DDI = número local americano
    if (!jaTemDDI && digitos.length === 10) return `tel:+1${digitos}`;
    return `tel:+${digitos}`;
  },
};

// ── importação do CSV ───────────────────────────────────────────────────────

export type LinhaProspeccao = {
  dominio: string;
  negocio: string;
  nicho: string;
  cidade: string;
  perfilCidade: "Afluente" | "Média";
  site: string;
  screenshot: string | null;
  potencial: number;
  notaSite: number;
  builder: string | null;
  temBooking: boolean;
  anoCopyright: string | null;
  instagram: string | null;
  seguidores: number | null;
  emails: string | null;
  diagnostico: string | null;
  comoAbordar: string | null;
  teste: boolean;
};

const COLUNAS_OBRIGATORIAS = ["site", "negocio", "potencial", "nota_site"];

/** Divide uma linha de CSV respeitando aspas e vírgulas internas. */
function dividirLinha(linha: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if (c === "," && !dentroDeAspas) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

/** "1,583" → 1583 | "11K" → 11000 | "" → null */
export function seguidoresParaNumero(texto: string): number | null {
  const t = texto.trim().replace(/,/g, "");
  if (!t) return null;
  const m = t.match(/^([\d.]+)\s*([KkMm]?)$/);
  if (!m) return null;
  let valor = Number(m[1]);
  if (!Number.isFinite(valor)) return null;
  const sufixo = m[2].toUpperCase();
  if (sufixo === "K") valor *= 1_000;
  if (sufixo === "M") valor *= 1_000_000;
  return Math.round(valor);
}

export function parseCsvProspeccao(conteudo: string): {
  linhas: LinhaProspeccao[];
  erros: string[];
} {
  const erros: string[] = [];
  // ﻿: Excel grava BOM; sem tirar, a primeira coluna vira "﻿potencial"
  const cruas = conteudo
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");

  if (cruas.length < 2) return { linhas: [], erros: ["Arquivo vazio ou só com cabeçalho."] };

  const cabecalho = dividirLinha(cruas[0]).map((c) => c.toLowerCase());
  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => !cabecalho.includes(c));
  if (faltando.length > 0) {
    return { linhas: [], erros: [`Coluna obrigatória faltando: ${faltando.join(", ")}.`] };
  }

  const idx = (nome: string) => cabecalho.indexOf(nome);
  const pegar = (campos: string[], nome: string) => {
    const i = idx(nome);
    return i === -1 ? "" : (campos[i] ?? "");
  };

  const linhas: LinhaProspeccao[] = [];
  const vistos = new Set<string>();

  for (let i = 1; i < cruas.length; i++) {
    const campos = dividirLinha(cruas[i]);
    const site = pegar(campos, "site");
    if (!site) continue;

    const dominio = site.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
    if (!dominio || vistos.has(dominio)) continue;
    vistos.add(dominio);

    const potencial = Number(pegar(campos, "potencial"));
    const notaSite = Number(pegar(campos, "nota_site"));
    if (!Number.isFinite(potencial) || !Number.isFinite(notaSite)) {
      erros.push(`Linha ${i + 1} (${dominio}): potencial ou nota do site não é número.`);
      continue;
    }

    const perfil = pegar(campos, "perfil_cidade");
    const booking = pegar(campos, "booking").toLowerCase();
    const instagram = pegar(campos, "instagram");

    linhas.push({
      dominio,
      negocio: pegar(campos, "negocio") || dominio,
      nicho: pegar(campos, "nicho") || "outros",
      cidade: pegar(campos, "cidade") || "—",
      perfilCidade: perfil === "Afluente" ? "Afluente" : "Média",
      site: dominio,
      screenshot: pegar(campos, "screenshot") || null,
      potencial: Math.max(1, Math.min(10, Math.round(potencial))),
      notaSite: Math.max(1, Math.min(10, Math.round(notaSite))),
      builder: pegar(campos, "builder") || null,
      temBooking: booking === "sim" || booking === "true",
      anoCopyright: pegar(campos, "ano_copyright") || null,
      instagram: instagram ? (instagram.startsWith("@") ? instagram : `@${instagram}`) : null,
      seguidores: seguidoresParaNumero(pegar(campos, "seguidores_ig")),
      emails: pegar(campos, "emails") || null,
      diagnostico: pegar(campos, "diagnostico_site") || null,
      comoAbordar: pegar(campos, "como_abordar") || null,
      // fixture do harness: nunca contamina metrica nem lead real
      teste: ["1", "sim", "true"].includes(pegar(campos, "teste").toLowerCase()),
    });
  }

  return { linhas, erros };
}

// ── contato corrigido à mão no painel ───────────────────────────────────────

/** Aceita handle, @handle ou URL colada do perfil. */
export function normalizarInstagram(texto: string): string | null {
  const limpo = texto
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?].*$/, "");
  return limpo ? `@${limpo}` : null;
}

/** Um ou mais e-mails separados por vírgula, ponto e vírgula ou barra. */
export function normalizarEmails(texto: string): string | null {
  const achados = texto
    .split(/[,;/\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return achados.length > 0 ? [...new Set(achados)].join(" / ") : null;
}
