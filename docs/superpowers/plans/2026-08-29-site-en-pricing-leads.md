# Site /en, Pricing Configurável e Leads — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar no ar a versão internacional do site (`/en`) com pricing configurável pelo painel e captura de leads dos formulários PT e EN numa aba nova do painel.

**Architecture:** O `app/` migra para três route groups com root layouts próprios — `(site-pt)` com `lang="pt-BR"`, `(site-en)` com `lang="en"`, `(app)` para login/painel — sem mudar nenhuma URL. O pricing vive como JSON na tabela `configuracoes` (chave `pricing_en`) e a `/en` continua estática: a action de salvar chama `revalidatePath("/en")`. Leads é uma tabela nova alimentada por uma server action pública compartilhada pelos dois formulários.

**Tech Stack:** Next.js 16.1.6 (App Router), React 19.2.3, Tailwind v4, Drizzle ORM + postgres-js (Supabase), Zod v4, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-17-site-en-pricing-leads-design.md`

## Global Constraints

- URLs imutáveis: `/`, `/en`, `/login`, `/painel/*`, `/api/*`. Route group nunca aparece na URL.
- `/` e `/en` devem sair **estáticas** (`○`) na tabela do `npm run build`; `/en` NUNCA pode ler `searchParams` no server component (isso a tornaria dinâmica — a rolagem de `?section=pricing` é client-side).
- Painel e site PT em pt-BR; `/en` em inglês americano de mercado (nunca tradução literal); preços sempre USD.
- Config de pricing: chave `pricing_en` na tabela `configuracoes`; padrão embutido no código: full `149700`, m6 `29900`×6, m12 `17900`×12, care `7900`/12 meses inclusos.
- Canais de lead por origem: EN = `email|sms|instagram|messenger` (sem telefone — coerente com "no calls"); BR = `whatsapp|email|instagram|telefone`.
- Status de lead: `novo|em_conversa|proposta|ganho|perdido` (default `novo`).
- Permissões novas (sempre por grupo, nunca por usuário): `leads.ver`, `leads.editar`, `site.precos`.
- Tabela nova com RLS habilitado e sem policies (padrão do projeto — a conexão direta bypassa RLS).
- Ambos formulários: honeypot `website` + validação Zod no servidor.
- Auditoria em toda escrita do painel e na criação de lead (ator `"sistema"`).
- Testes: `npm test` (vitest, `lib/**/*.test.ts`). Build: `npm run build`. Migrations: `npx drizzle-kit generate` + `npm run db:migrate`.
- Commits em português no estilo do repo, na branch `plataforma`.
- A copy EN deste plano vai ao ar, mas os blocos principais (hero, no-calls, how it works, FAQ) são apresentados ao João para revisão ao final — mudanças de tom são esperadas e baratas (só texto).

---

### Task 1: Route groups com root layouts separados

Migração pura — zero mudança de comportamento ou URL. Só mover arquivos e dividir o root layout.

**Files:**
- Create: `components/raiz-html.tsx`
- Create: `app/(app)/layout.tsx`
- Move: `app/layout.tsx` → `app/(site-pt)/layout.tsx` (reescrito para usar RaizHtml)
- Move: `app/page.tsx` → `app/(site-pt)/page.tsx` (conteúdo intacto)
- Move: `app/opengraph-image.tsx` → `app/(site-pt)/opengraph-image.tsx` (intacto)
- Move: `app/login/` → `app/(app)/login/`; `app/painel/` → `app/(app)/painel/`
- Modify: todos os imports `@/app/login/...` e `@/app/painel/...` (em `app/` e `components/`)
- Ficam na raiz: `app/globals.css`, `app/favicon.ico`, `app/robots.ts`, `app/sitemap.ts`, `app/api/`

**Interfaces:**
- Consumes: nada novo.
- Produces: `RaizHtml({ lang, children })` de `@/components/raiz-html` — usado pelos três root layouts (Task 7 cria o terceiro). `lang: "pt-BR" | "en"`.

- [ ] **Step 1: Criar `components/raiz-html.tsx`**

```tsx
import { Geist, Geist_Mono } from "next/font/google";
import "@/app/globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Marca que o JS está ativo antes do <body> ser pintado. O CSS usa `.js` para
// só então esconder os blocos de reveal — sem isso a página seria invisível
// para quem não executa JS.
const ENABLE_JS_CLASS = `document.documentElement.classList.add('js')`;

/**
 * Esqueleto <html>/<body> compartilhado pelos três root layouts (site PT,
 * site EN, área logada). O route group define o idioma; o resto é idêntico.
 */
export function RaizHtml({
  lang,
  children,
}: {
  lang: "pt-BR" | "en";
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: o script abaixo adiciona a classe `js` antes
    // da hidratação (mecanismo de reveal da landing) — divergência esperada.
    <html lang={lang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ENABLE_JS_CLASS }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Mover os arquivos com git mv**

```bash
mkdir -p "app/(site-pt)" "app/(app)"
git mv app/layout.tsx "app/(site-pt)/layout.tsx"
git mv app/page.tsx "app/(site-pt)/page.tsx"
git mv app/opengraph-image.tsx "app/(site-pt)/opengraph-image.tsx"
git mv app/login "app/(app)/login"
git mv app/painel "app/(app)/painel"
```

- [ ] **Step 3: Reescrever `app/(site-pt)/layout.tsx`**

Manter TODO o objeto `metadata` e o `viewport` que já estavam no root layout (metadataBase, title, description, openGraph, twitter, robots, category — nada muda). Substituir apenas: remover imports de fontes/globals.css/ENABLE_JS_CLASS e o JSX de `<html>`/`<body>`, delegando ao componente:

```tsx
import type { Metadata } from "next";
import { SITE, SITE_URL } from "@/lib/site";
import { RaizHtml } from "@/components/raiz-html";

export const metadata: Metadata = {
  // ... exatamente o metadata atual do app/layout.tsx, sem mudanças ...
};

export const viewport = {
  themeColor: "#05070b",
  viewportFit: "cover" as const,
};

export default function LayoutSitePt({ children }: { children: React.ReactNode }) {
  return <RaizHtml lang="pt-BR">{children}</RaizHtml>;
}
```

- [ ] **Step 4: Criar `app/(app)/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { RaizHtml } from "@/components/raiz-html";

export const metadata: Metadata = {
  title: { default: "RVLand", template: "%s | RVLand" },
  robots: { index: false, follow: false },
};

export const viewport = {
  themeColor: "#05070b",
  viewportFit: "cover" as const,
};

export default function LayoutApp({ children }: { children: React.ReactNode }) {
  return <RaizHtml lang="pt-BR">{children}</RaizHtml>;
}
```

- [ ] **Step 5: Corrigir os imports que apontam para os caminhos antigos**

```bash
grep -rl "@/app/painel/" app components | xargs perl -pi -e "s{\@/app/painel/}{\@/app/(app)/painel/}g"
grep -rl "@/app/login/" app components | xargs perl -pi -e "s{\@/app/login/}{\@/app/(app)/login/}g"
grep -rn "@/app/painel/\|@/app/login/" app components lib   # deve retornar vazio
```

- [ ] **Step 6: Build + verificação de rotas e arquivos de metadata na raiz**

```bash
npm run build
```
Esperado: exit 0; na tabela de rotas, `○ /` (estática), `ƒ /painel` e filhas, `/login`, `/api/*` presentes. Depois:

```bash
npx next start -p 3100 & sleep 3
curl -s -o /dev/null -w "%{http_code} " http://localhost:3100/ http://localhost:3100/favicon.ico http://localhost:3100/robots.txt http://localhost:3100/sitemap.xml http://localhost:3100/nao-existe; echo
kill %1
```
Esperado: `200 200 200 200 404`. Se robots/sitemap/favicon falharem por causa dos múltiplos root layouts (risco anotado no spec §3), movê-los para `app/(site-pt)/` e repetir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Route groups: raiz separada para site PT, /en futuro e área logada"
```

---

### Task 2: Domínio de preços USD (`pricing_en`)

**Files:**
- Create: `lib/dominio/preco-site.ts`
- Test: `lib/dominio/preco-site.test.ts`
- Modify: `lib/formato.ts` (formatarDolares, dolaresParaCentavos)
- Create: `lib/formato.test.ts`
- Modify: `lib/dominio/mascaras.ts` (mascararDinheiroUS)
- Modify: `lib/dominio/mascaras.test.ts` (novo describe)
- Modify: `components/painel/inputs-mascarados.tsx` (InputDolar)

**Interfaces:**
- Produces: `esquemaPricingEn` (Zod), `type PricingEn`, `PRICING_EN_PADRAO: PricingEn`, `parsePricingEn(valor: unknown): PricingEn` (cai no padrão se inválido/ausente), `totalPlano(valorCentavos: number, parcelas: number): number` — tudo de `@/lib/dominio/preco-site`. `formatarDolares(centavos: number): string` ("$1,497" sem centavos zerados; "$79.50" com), `dolaresParaCentavos(texto: string): number` (NaN se inválido) de `@/lib/formato`. `mascararDinheiroUS(texto: string): string` de `@/lib/dominio/mascaras`. `InputDolar` (mesmas props dos irmãos: `defaultValue` em dígitos de centavos, `aoMudar`) de `@/components/painel/inputs-mascarados`.

- [ ] **Step 1: Escrever os testes**

`lib/dominio/preco-site.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PRICING_EN_PADRAO, parsePricingEn, totalPlano } from "@/lib/dominio/preco-site";

describe("parsePricingEn", () => {
  it("aceita JSON válido", () => {
    const p = parsePricingEn(PRICING_EN_PADRAO);
    expect(p.planos.m6.parcelas).toBe(6);
    expect(p.care.mesesInclusos).toBe(12);
  });

  it("cai no padrão quando ausente ou inválido", () => {
    expect(parsePricingEn(undefined)).toEqual(PRICING_EN_PADRAO);
    expect(parsePricingEn(null)).toEqual(PRICING_EN_PADRAO);
    expect(parsePricingEn({ moeda: "BRL" })).toEqual(PRICING_EN_PADRAO);
  });
});

describe("totalPlano", () => {
  it("multiplica parcela × meses", () => {
    expect(totalPlano(29900, 6)).toBe(179400);
    expect(totalPlano(17900, 12)).toBe(214800);
  });
});
```

`lib/formato.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dolaresParaCentavos, formatarDolares } from "@/lib/formato";

describe("formatarDolares", () => {
  it("omite centavos zerados", () => {
    expect(formatarDolares(149700)).toBe("$1,497");
    expect(formatarDolares(7900)).toBe("$79");
  });

  it("mostra centavos quando existem", () => {
    expect(formatarDolares(7950)).toBe("$79.50");
  });
});

describe("dolaresParaCentavos", () => {
  it("aceita formato US com milhar", () => {
    expect(dolaresParaCentavos("1,497.00")).toBe(149700);
  });

  it("aceita inteiro seco", () => {
    expect(dolaresParaCentavos("299")).toBe(29900);
  });

  it("rejeita lixo", () => {
    expect(dolaresParaCentavos("abc")).toBeNaN();
    expect(dolaresParaCentavos("")).toBeNaN();
  });
});
```

Acrescentar em `lib/dominio/mascaras.test.ts`:

```ts
describe("mascararDinheiroUS", () => {
  it("formata progressivamente no padrão americano", () => {
    expect(mascararDinheiroUS("149700")).toBe("1,497.00");
    expect(mascararDinheiroUS("5")).toBe("0.05");
    expect(mascararDinheiroUS("")).toBe("");
  });
});
```
(e importar `mascararDinheiroUS` no topo do arquivo de teste.)

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test
```
Esperado: FAIL — módulos/funções não existem.

- [ ] **Step 3: Implementar**

`lib/dominio/preco-site.ts`:

```ts
import { z } from "zod";

/**
 * Pricing da /en, guardado em `configuracoes` sob a chave `pricing_en`.
 * Qualquer JSON inválido cai no padrão — a página nunca quebra por config.
 */
export const esquemaPricingEn = z.object({
  moeda: z.literal("USD"),
  planos: z.object({
    full: z.object({ ativo: z.boolean(), valorCentavos: z.number().int().positive() }),
    m6: z.object({
      ativo: z.boolean(),
      valorCentavos: z.number().int().positive(),
      parcelas: z.literal(6),
    }),
    m12: z.object({
      ativo: z.boolean(),
      valorCentavos: z.number().int().positive(),
      parcelas: z.literal(12),
    }),
  }),
  care: z.object({
    valorCentavos: z.number().int().positive(),
    mesesInclusos: z.number().int().min(1).max(36),
  }),
});

export type PricingEn = z.infer<typeof esquemaPricingEn>;

export const PRICING_EN_PADRAO: PricingEn = {
  moeda: "USD",
  planos: {
    full: { ativo: true, valorCentavos: 149700 },
    m6: { ativo: true, valorCentavos: 29900, parcelas: 6 },
    m12: { ativo: true, valorCentavos: 17900, parcelas: 12 },
  },
  care: { valorCentavos: 7900, mesesInclusos: 12 },
};

export function parsePricingEn(valor: unknown): PricingEn {
  const r = esquemaPricingEn.safeParse(valor);
  return r.success ? r.data : PRICING_EN_PADRAO;
}

export function totalPlano(valorCentavos: number, parcelas: number): number {
  return valorCentavos * parcelas;
}
```

Acrescentar em `lib/formato.ts`:

```ts
/** USD: "$1,497" quando os centavos são zero; "$79.50" quando não. */
export function formatarDolares(centavos: number): string {
  const semCentavos = centavos % 100 === 0;
  return (centavos / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: semCentavos ? 0 : 2,
    maximumFractionDigits: semCentavos ? 0 : 2,
  });
}

/** "1,497.00" ou "1497" (input humano US) → centavos. NaN se inválido. */
export function dolaresParaCentavos(texto: string): number {
  const limpo = texto.trim().replace(/[$\s,]/g, "");
  if (limpo === "") return NaN;
  const valor = Number(limpo);
  if (!Number.isFinite(valor)) return NaN;
  return Math.round(valor * 100);
}
```

Acrescentar em `lib/dominio/mascaras.ts`:

```ts
/** Estilo banco US: cada dígito entra pelos centavos. "149700" → "1,497.00". */
export function mascararDinheiroUS(texto: string): string {
  const d = digitos(texto).replace(/^0+(?=\d)/, "");
  if (d === "") return "";
  const centavos = d.padStart(3, "0");
  const inteiro = centavos.slice(0, -2);
  const decimais = centavos.slice(-2);
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${comMilhar}.${decimais}`;
}
```

Acrescentar em `components/painel/inputs-mascarados.tsx` (importar `mascararDinheiroUS`):

```tsx
export function InputDolar({ defaultValue, aoMudar, className, ...props }: PropsBase) {
  const { valor, onChange } = useMascara(mascararDinheiroUS, defaultValue, aoMudar);
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-white/35">
        $
      </span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="0.00"
        value={valor}
        onChange={onChange}
        className="!pl-8"
        {...props}
      />
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```
Esperado: PASS (suites novas + todas as antigas).

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/preco-site.ts lib/dominio/preco-site.test.ts lib/formato.ts lib/formato.test.ts lib/dominio/mascaras.ts lib/dominio/mascaras.test.ts components/painel/inputs-mascarados.tsx
git commit -m "Domínio: preços USD do site (pricing_en) com máscara e formatação US"
```

---

### Task 3: Domínio de leads

**Files:**
- Create: `lib/dominio/leads.ts`
- Test: `lib/dominio/leads.test.ts`

**Interfaces:**
- Produces (de `@/lib/dominio/leads`): `CANAIS_EN`, `CANAIS_BR` (readonly arrays), `TODOS_CANAIS`, `type CanalLead`, `type OrigemLead = "br" | "en"`, `STATUS_LEAD` (readonly array), `type StatusLead`, `esquemaLead` (Zod — valida canal × origem e contato × canal), `type LeadEntrada = z.infer<typeof esquemaLead>`, `normalizarLead(dados: LeadEntrada): LeadEntrada`, `linkContato(canal: CanalLead, contato: string): string`, `rotuloCanal: Record<CanalLead, string>`.

- [ ] **Step 1: Escrever os testes**

`lib/dominio/leads.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `lib/dominio/leads.ts`**

```ts
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
```

- [ ] **Step 4: Rodar e ver passar** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/leads.ts lib/dominio/leads.test.ts
git commit -m "Domínio: leads — canais por origem, normalização e links de contato"
```

---

### Task 4: Banco — tabela `leads` + RLS + auditoria

**Files:**
- Modify: `lib/db/schema.ts` (tabela `leads`; união de `auditoria.entidade` ganha `"lead"`)
- Modify: `lib/audit.ts` (união `Entidade` ganha `"lead"`)
- Create (geradas): `drizzle/0006_*.sql`, `drizzle/0007_rls_leads.sql`

**Interfaces:**
- Consumes: tipos de `lib/dominio/leads` são espelhados inline no schema (o schema não importa do domínio — padrão do arquivo).
- Produces: `leads` (Drizzle table) exportada por `@/lib/db`; colunas `id, origem, nome, negocio, siteAtual, contato, canal, mensagem, status, notas, criadoEm, atualizadoEm`; `registrarAuditoria` aceita `entidade: "lead"`.

- [ ] **Step 1: Acrescentar a tabela ao schema**

No fim de `lib/db/schema.ts`:

```ts
// ─── Site público: leads dos formulários (BR e EN) ──────────────────────────

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    origem: text("origem").notNull().$type<"br" | "en">(),
    nome: text("nome").notNull(),
    negocio: text("negocio"),
    siteAtual: text("site_atual"),
    canal: text("canal")
      .notNull()
      .$type<"email" | "sms" | "instagram" | "messenger" | "whatsapp" | "telefone">(),
    contato: text("contato").notNull(),
    mensagem: text("mensagem").notNull(),
    status: text("status")
      .notNull()
      .default("novo")
      .$type<"novo" | "em_conversa" | "proposta" | "ganho" | "perdido">(),
    notas: text("notas"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("leads_origem_status_idx").on(t.origem, t.status)]
);
```

E na tabela `auditoria`, acrescentar `| "lead"` à união do `$type<...>` de `entidade`. Em `lib/audit.ts`, acrescentar `| "lead"` ao type `Entidade`.

- [ ] **Step 2: Gerar as migrations**

```bash
npx drizzle-kit generate
npx drizzle-kit generate --custom --name=rls_leads
```
Preencher o arquivo custom gerado (`drizzle/0007_rls_leads.sql`) com:

```sql
-- RLS ligado, sem policies: a API REST anônima do Supabase nega qualquer
-- acesso. O app usa a conexão direta (DATABASE_URL), que bypassa RLS.
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3: Aplicar e verificar**

```bash
npm run db:migrate
npx tsx -e "
import { config } from 'dotenv'; config({ path: '.env.local' });
const { db, leads } = await import('./lib/db');
const linhas = await db.select().from(leads);
console.log('tabela leads ok — linhas:', linhas.length);
process.exit(0);
"
```
Esperado: `Migrations aplicadas.` e `tabela leads ok — linhas: 0`.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts lib/audit.ts drizzle/
git commit -m "Banco: tabela leads (RLS) e entidade lead na auditoria"
```

---

### Task 5: Ação pública `criarLead` + formulário PT grava lead

**Files:**
- Create: `lib/acoes/criar-lead.ts`
- Modify: `components/landing/contact-form.tsx` (reescrito)

**Interfaces:**
- Consumes: `esquemaLead`, `normalizarLead` (Task 3); `leads` (Task 4); `registrarAuditoria`.
- Produces: `criarLead(entrada): Promise<EstadoLeadPublico>` de `@/lib/acoes/criar-lead`, com `EstadoLeadPublico = { ok?: boolean; erro?: string }`. `entrada` é objeto plano: `{ website?, origem, nome, negocio?, siteAtual?, canal, contato, mensagem }` (strings). O formulário EN (Task 6) consome a mesma ação.
- Contrato de erro: a ação devolve `erro: "invalid"` genérico — cada formulário faz a validação amigável no cliente, no seu idioma, ANTES de enviar; a mensagem do servidor é só fallback.

- [ ] **Step 1: Criar `lib/acoes/criar-lead.ts`**

```ts
"use server";

import { db, leads } from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
import { esquemaLead, normalizarLead } from "@/lib/dominio/leads";

export type EstadoLeadPublico = { ok?: boolean; erro?: string };

/**
 * Ação pública dos dois formulários do site (PT e EN). O campo `website` é
 * honeypot: humano não vê; bot preenche e recebe um "sucesso" inofensivo.
 */
export async function criarLead(entrada: {
  website?: string;
  origem: string;
  nome: string;
  negocio?: string;
  siteAtual?: string;
  canal: string;
  contato: string;
  mensagem: string;
}): Promise<EstadoLeadPublico> {
  if (entrada.website && entrada.website.trim() !== "") return { ok: true };

  const dados = esquemaLead.safeParse(entrada);
  if (!dados.success) return { erro: "invalid" };

  const lead = normalizarLead(dados.data);

  await db.insert(leads).values({
    origem: lead.origem,
    nome: lead.nome,
    negocio: lead.negocio ?? null,
    siteAtual: lead.siteAtual ?? null,
    canal: lead.canal,
    contato: lead.contato,
    mensagem: lead.mensagem,
  });

  await registrarAuditoria({
    ator: "sistema",
    acao: "lead.criado",
    entidade: "lead",
    detalhes: { origem: lead.origem, canal: lead.canal, nome: lead.nome },
  });

  return { ok: true };
}
```

- [ ] **Step 2: Reescrever `components/landing/contact-form.tsx`**

Mantém o motivo de editor de código, o Magnetic e o estilo dos botões atuais. Muda: pills de canal (WhatsApp/Email/Instagram/Telefone), placeholder do contato por canal, honeypot, UM botão de envio com rótulo dinâmico. Fluxo: valida no cliente → `criarLead` → confirmação inline; para WhatsApp/Email, ainda abre o canal com o resumo (comportamento atual preservado).

Arquivo completo:

```tsx
"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Magnetic } from "@/components/landing/magnetic";
import { buildMailto, buildWhatsappLink } from "@/lib/site";
import { criarLead } from "@/lib/acoes/criar-lead";
import { cn } from "@/lib/utils";

type CanalBR = "whatsapp" | "email" | "instagram" | "telefone";
type Field = "nome" | "contato" | "mensagem";

const CANAIS: { valor: CanalBR; rotulo: string; placeholder: string }[] = [
  { valor: "whatsapp", rotulo: "WhatsApp", placeholder: "(41) 99999-9999" },
  { valor: "email", rotulo: "Email", placeholder: "seu@email.com" },
  { valor: "instagram", rotulo: "Instagram", placeholder: "@seuperfil" },
  { valor: "telefone", rotulo: "Telefone", placeholder: "(41) 99999-9999" },
];

const EMPTY: Record<Field, string> = { nome: "", contato: "", mensagem: "" };

function validate(form: Record<Field, string>, canal: CanalBR) {
  const errors: Partial<Record<Field, string>> = {};
  if (!form.nome.trim()) errors.nome = "Informe seu nome.";
  if (canal === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contato.trim()))
      errors.contato = "Informe um email válido.";
  } else if (canal === "instagram") {
    if (form.contato.trim().length < 2) errors.contato = "Informe seu @ do Instagram.";
  } else if (form.contato.replace(/\D/g, "").length < 10) {
    errors.contato = "Informe o número com DDD.";
  }
  if (form.mensagem.trim().length < 10)
    errors.mensagem = "Descreva o projeto em pelo menos uma frase.";
  return errors;
}

function buildBody(form: Record<Field, string>, canal: CanalBR) {
  return `Nome: ${form.nome}\nContato (${canal}): ${form.contato}\n\nMensagem:\n${form.mensagem}`;
}

export function CodeContactForm({
  email,
  whatsapp,
}: {
  email: string;
  whatsapp: string;
}) {
  const [form, setForm] = React.useState(EMPTY);
  const [canal, setCanal] = React.useState<CanalBR>("whatsapp");
  const [errors, setErrors] = React.useState<Partial<Record<Field, string>>>({});
  const [submitted, setSubmitted] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [sucesso, setSucesso] = React.useState(false);
  const [erroGeral, setErroGeral] = React.useState<string | null>(null);
  const honeypotRef = React.useRef<HTMLInputElement | null>(null);

  const set = (field: Field) => (value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (submitted) setErrors(validate({ ...form, [field]: value }, canal));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    const found = validate(form, canal);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setEnviando(true);
    setErroGeral(null);
    try {
      const resultado = await criarLead({
        origem: "br",
        website: honeypotRef.current?.value ?? "",
        nome: form.nome,
        canal,
        contato: form.contato,
        mensagem: form.mensagem,
      });

      if (!resultado.ok) {
        setErroGeral("Algo deu errado — tente de novo ou chame direto no WhatsApp.");
        return;
      }

      setSucesso(true);

      const corpo = buildBody(form, canal);
      if (canal === "whatsapp") {
        const wa = buildWhatsappLink(whatsapp, `Olá! Segue meu pedido:\n\n${corpo}`);
        if (wa) window.open(wa, "_blank", "noopener,noreferrer");
      } else if (canal === "email") {
        const to = buildMailto(email, `Projeto RVLand — ${form.nome}`, corpo);
        if (to) window.location.href = to;
      }
    } catch {
      setErroGeral("Algo deu errado — tente de novo ou chame direto no WhatsApp.");
    } finally {
      setEnviando(false);
    }
  };

  const line = (n: number, content: React.ReactNode) => (
    <div className="grid grid-cols-[34px_1fr] gap-3">
      <div className="select-none text-right text-xs text-white/35">{n}</div>
      <div className="min-w-0 text-sm text-white/85">{content}</div>
    </div>
  );

  const fieldError = (field: Field) =>
    errors[field] ? (
      <p id={`erro-${field}`} role="alert" className="mt-1 text-xs text-red-300">
        {errors[field]}
      </p>
    ) : null;

  const canalAtual = CANAIS.find((c) => c.valor === canal)!;

  return (
    <Card className="rounded-2xl border-white/10 bg-[rgba(10,14,20,0.72)] backdrop-blur-md">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-400/80" />
            <span className="h-3 w-3 rounded-full bg-yellow-300/80" />
            <span className="h-3 w-3 rounded-full bg-green-400/80" />
            <span className="ml-3 text-xs text-white/60">projeto.ts</span>
          </div>
          <Badge className="border-white/10 bg-white/5 text-white/70">
            Estamos de prontidão
          </Badge>
        </div>

        <CardTitle className="text-white">Descreva o projeto</CardTitle>
        <CardDescription className="text-white/70">
          Um resumo direto já é suficiente para começarmos.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {/* honeypot anti-spam: humano não vê */}
          <div className="hidden" aria-hidden="true">
            <input
              ref={honeypotRef}
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 font-mono">
            <div className="space-y-3">
              {line(
                1,
                <span className="text-white/55">
                  {"// "}Vamos transformar sua ideia em produto.
                </span>
              )}
              {line(
                2,
                <span>
                  <span className="text-[rgba(0,229,255,0.95)]">const</span>{" "}
                  <span className="text-white/90">projeto</span>{" "}
                  <span className="text-white/60">=</span>{" "}
                  <span className="text-white/60">{"{"}</span>
                </span>
              )}

              {line(
                3,
                <div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label htmlFor="nome" className="shrink-0 text-white/60">
                      nome:
                    </label>
                    <Input
                      id="nome"
                      name="nome"
                      required
                      value={form.nome}
                      onChange={(e) => set("nome")(e.target.value)}
                      aria-invalid={!!errors.nome}
                      aria-describedby={errors.nome ? "erro-nome" : undefined}
                      placeholder="Seu nome"
                      className="h-9 w-full rounded-xl border-white/10 bg-white/5 font-mono text-white placeholder:text-white/35"
                    />
                  </div>
                  {fieldError("nome")}
                </div>
              )}

              {line(
                4,
                <div className="flex flex-wrap items-center gap-2">
                  <span className="shrink-0 text-white/60">canal:</span>
                  {CANAIS.map((c) => (
                    <button
                      key={c.valor}
                      type="button"
                      onClick={() => setCanal(c.valor)}
                      aria-pressed={canal === c.valor}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs transition-colors",
                        canal === c.valor
                          ? "border-[rgba(0,229,255,0.5)] bg-[rgba(0,229,255,0.12)] text-white"
                          : "border-white/10 bg-white/5 text-white/55 hover:text-white"
                      )}
                    >
                      {c.rotulo}
                    </button>
                  ))}
                </div>
              )}

              {line(
                5,
                <div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label htmlFor="contato" className="shrink-0 text-white/60">
                      contato:
                    </label>
                    <Input
                      id="contato"
                      name="contato"
                      required
                      value={form.contato}
                      onChange={(e) => set("contato")(e.target.value)}
                      aria-invalid={!!errors.contato}
                      aria-describedby={errors.contato ? "erro-contato" : undefined}
                      placeholder={canalAtual.placeholder}
                      className="h-9 w-full rounded-xl border-white/10 bg-white/5 font-mono text-white placeholder:text-white/35"
                    />
                  </div>
                  {fieldError("contato")}
                </div>
              )}

              {line(
                6,
                <div className="min-w-0">
                  <label htmlFor="mensagem" className="block text-white/60">
                    mensagem: `
                  </label>
                  <Textarea
                    id="mensagem"
                    name="mensagem"
                    required
                    value={form.mensagem}
                    onChange={(e) => set("mensagem")(e.target.value)}
                    aria-invalid={!!errors.mensagem}
                    aria-describedby={errors.mensagem ? "erro-mensagem" : undefined}
                    placeholder={
                      "O que você quer construir?\nEx: área logada + pagamentos + painel admin..."
                    }
                    className="mt-2 min-h-[120px] w-full rounded-xl border-white/10 bg-white/5 font-mono text-white placeholder:text-white/35"
                  />
                  {fieldError("mensagem")}
                  <div className="mt-2 text-white/60">`</div>
                </div>
              )}

              {line(7, <span className="text-white/60">{"}"};</span>)}
              {line(
                8,
                <span className="text-white/55">
                  {"// "}Clique em{" "}
                  <span className="text-[rgba(0,255,138,0.9)]">Enviar</span> para
                  continuar.
                </span>
              )}
            </div>
          </div>

          <Magnetic className="w-full">
            <Button
              id="enviar-lead"
              type="submit"
              disabled={enviando}
              className={[
                "group relative h-11 w-full min-w-0 rounded-xl text-sm font-medium text-white",
                "border border-white/10 bg-[rgba(0,255,138,0.16)]",
                "shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_18px_40px_rgba(0,0,0,0.35)]",
                "transition-all duration-200",
                "hover:-translate-y-[1px] hover:border-white/15 hover:bg-[rgba(0,255,138,0.22)]",
                "active:translate-y-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,255,138,0.35)] focus-visible:ring-offset-0",
                "overflow-hidden",
              ].join(" ")}
            >
              <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <span className="absolute -inset-24 bg-[radial-gradient(circle,rgba(0,255,138,0.28),transparent_55%)]" />
                <span className="absolute -left-16 top-0 h-full w-24 -skew-x-12 bg-white/10 opacity-0 blur-md transition-all duration-300 group-hover:left-[120%] group-hover:opacity-100" />
              </span>

              <span className="relative inline-flex w-full items-center justify-center gap-2">
                <span>
                  {enviando
                    ? "Enviando..."
                    : canal === "whatsapp"
                      ? "Enviar e abrir WhatsApp"
                      : canal === "email"
                        ? "Enviar por email"
                        : "Enviar"}
                </span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </Button>
          </Magnetic>

          {sucesso ? (
            <p role="status" className="text-sm text-emerald-300">
              Recebido! Vamos te responder por {canalAtual.rotulo}.
            </p>
          ) : null}
          {erroGeral ? (
            <p role="alert" className="text-sm text-red-300">
              {erroGeral}
            </p>
          ) : null}

          <p className="text-xs text-white/45">
            Seu pedido fica registrado com a gente e respondemos pelo canal que
            você escolher. Se preferir, escreva direto para{" "}
            <span className="text-white/70">{email}</span>.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Verificar** — `npm test` (nada quebrou) e `npm run build` (exit 0, `/` continua `○` estática — a server action não muda isso).

- [ ] **Step 4: Commit**

```bash
git add lib/acoes/criar-lead.ts components/landing/contact-form.tsx
git commit -m "Leads: ação pública criar-lead; formulário PT grava lead antes de abrir canal"
```

---

### Task 6: Copy EN + componentes da /en

**Files:**
- Create: `lib/site-en.ts`
- Create: `components/en/pricing-section.tsx`
- Create: `components/en/lead-form.tsx`
- Create: `components/en/rolagem-secao.tsx`
- Modify: `app/globals.css` (keyframe da troca de preço)

**Interfaces:**
- Consumes: `PricingEn`, `totalPlano` (Task 2); `formatarDolares` (Task 2); `criarLead` (Task 5).
- Produces: `SITE_EN`, `INCLUDED_EN`, `STEPS_EN`, `FAQ_EN` de `@/lib/site-en`; `PricingSection({ pricing: PricingEn })`, `LeadFormEn()`, `RolagemSecao()` de `@/components/en/*`. IDs estáveis para o Playwright: inputs `#lead-nome`, `#lead-negocio`, `#lead-site`, `#lead-contato`, `#lead-mensagem`, submit `#lead-enviar`; pills com os rótulos "Text (SMS)", "Email", "Instagram DM", "Messenger"; sucesso contém o texto "Got it".

- [ ] **Step 1: Criar `lib/site-en.ts`** (a copy oficial — revisão do João no fim)

```ts
/**
 * Conteúdo do site internacional (/en). NÃO é tradução do PT: público
 * diferente (small business americano), oferta diferente (website + booking).
 */

export const SITE_EN = {
  name: "RVLand Devs",
  title: "RVLand Devs | Websites for small businesses — no calls, just text",
  description:
    "We design, write, and launch your business website. Approve everything by message — no calls, no meetings. One price, everything included.",
  keywords: [
    "small business website",
    "website design",
    "local business website",
    "car wash website",
    "affordable website design",
    "website with booking",
    "web design no meetings",
  ],
} as const;

export const INCLUDED_EN = [
  {
    title: "Custom design",
    desc: "Built for your business — never a template.",
  },
  {
    title: "Perfect on phones",
    desc: "Most of your customers are on mobile. Your site looks sharp there first.",
  },
  {
    title: "Google Maps & reviews",
    desc: "Show customers where you are and why they should pick you.",
  },
  {
    title: "Contact & booking forms",
    desc: "Customers reach you or request a booking in seconds.",
  },
  {
    title: "Search-engine ready",
    desc: "Clean SEO basics so locals actually find you on Google.",
  },
  {
    title: "Secure (SSL)",
    desc: "The padlock in the browser — trust, built in.",
  },
  {
    title: "Fast hosting",
    desc: "Your site stays fast and online. We handle all of it.",
  },
  {
    title: "Real support",
    desc: "Need a change? Text us. We keep your site fresh.",
  },
] as const;

export const STEPS_EN = [
  {
    title: "Send us your info",
    desc: "Tell us about your business by message: services, photos, hours. We take it from there.",
  },
  {
    title: "Approve your design",
    desc: "We send a live preview to your phone. Ask for changes until you love it.",
  },
  {
    title: "Go live",
    desc: "We launch your site, connect your domain, and keep everything running.",
  },
] as const;

export const FAQ_EN = [
  {
    q: "Do I own my website?",
    a: "Yes. Once your plan is paid in full, the site is 100% yours — domain, design, and content.",
  },
  {
    q: "How long does it take?",
    a: "Most sites are ready for your approval within days of getting your info, and live shortly after you approve.",
  },
  {
    q: "Who writes the content?",
    a: "We do. Send us the basics about your business and we write clear, professional copy — you approve every word.",
  },
  {
    q: "What happens after the first 12 months?",
    a: "Support & hosting continues at $79/month — updates, backups, and changes by text. You can also move your site elsewhere; it's yours.",
  },
  {
    q: "Why don't you do calls?",
    a: "Because you don't have time for them. Everything happens by message — faster for you, documented for both of us. No meetings. No pressure.",
  },
] as const;
```

- [ ] **Step 2: Criar `components/en/pricing-section.tsx`**

```tsx
"use client";

import * as React from "react";
import { ArrowRight, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatarDolares } from "@/lib/formato";
import { totalPlano, type PricingEn } from "@/lib/dominio/preco-site";

type IdPlano = "full" | "m6" | "m12";

const ROTULOS: Record<IdPlano, string> = {
  full: "Pay in full",
  m6: "6 months",
  m12: "12 months",
};

/** Seletor de três posições com pílula deslizante; valores vêm do painel. */
export function PricingSection({ pricing }: { pricing: PricingEn }) {
  const opcoes = (["full", "m6", "m12"] as const).filter(
    (id) => pricing.planos[id].ativo
  );
  const [ativo, setAtivo] = React.useState<IdPlano>(opcoes[0] ?? "full");
  const indice = Math.max(0, opcoes.indexOf(ativo));

  const plano = pricing.planos[ativo];
  const parcelado = ativo !== "full" ? pricing.planos[ativo as "m6" | "m12"] : null;

  const linhaCare = `Includes ${pricing.care.mesesInclusos} months of support & hosting. After that, just ${formatarDolares(pricing.care.valorCentavos)}/month.`;

  return (
    <div className="mx-auto max-w-xl">
      {/* seletor */}
      <div
        className="relative grid rounded-2xl border border-white/10 bg-black/30 p-1.5"
        style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}
      >
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-1.5 rounded-xl bg-gradient-to-r from-[rgba(0,229,255,0.22)] to-[rgba(0,255,138,0.18)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-transform duration-300 ease-out"
          style={{
            width: `calc((100% - 0.75rem) / ${opcoes.length})`,
            transform: `translateX(${indice * 100}%)`,
          }}
        />
        {opcoes.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setAtivo(id)}
            aria-pressed={ativo === id}
            className={cn(
              "relative z-10 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              ativo === id ? "text-white" : "text-white/50 hover:text-white/80"
            )}
          >
            {ROTULOS[id]}
          </button>
        ))}
      </div>

      {/* valor */}
      <div
        key={ativo}
        className="rv-precos-troca mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center backdrop-blur-md"
      >
        <div className="text-5xl font-semibold tracking-tight text-white md:text-6xl">
          {formatarDolares(plano.valorCentavos)}
          {parcelado ? (
            <span className="text-2xl font-normal text-white/50">/mo</span>
          ) : null}
        </div>
        <div className="rv-num mt-2 text-sm text-white/50">
          {parcelado
            ? `for ${parcelado.parcelas} months · ${formatarDolares(
                totalPlano(parcelado.valorCentavos, parcelado.parcelas)
              )} total`
            : "one-time payment"}
        </div>

        <ul className="mx-auto mt-6 max-w-xs space-y-2 text-left text-sm text-white/70">
          {["Custom design & copy", "Booking & contact forms", "Live in days"].map(
            (item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[rgba(0,255,138,0.9)]" />
                <span>{item}</span>
              </li>
            )
          )}
        </ul>

        <a
          href="#contact"
          className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[rgba(0,255,138,0.16)] px-6 text-sm font-medium text-white transition-all hover:-translate-y-[1px] hover:bg-[rgba(0,255,138,0.22)]"
        >
          Get your free concept
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>

      <p className="mt-5 text-center text-sm text-white/55">{linhaCare}</p>
    </div>
  );
}
```

- [ ] **Step 3: Keyframe da troca em `app/globals.css`** (fora do escopo `.painel`, junto das regras da landing):

```css
/* /en: troca suave do valor no seletor de pricing */
@keyframes rv-precos-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
.rv-precos-troca { animation: rv-precos-in 0.25s ease both; }
@media (prefers-reduced-motion: reduce) {
  .rv-precos-troca { animation: none; }
}
```

- [ ] **Step 4: Criar `components/en/lead-form.tsx`**

```tsx
"use client";

import * as React from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { criarLead } from "@/lib/acoes/criar-lead";

type CanalEN = "email" | "sms" | "instagram" | "messenger";
type Field = "nome" | "negocio" | "siteAtual" | "contato" | "mensagem";

const CHANNELS: { value: CanalEN; label: string; placeholder: string }[] = [
  { value: "sms", label: "Text (SMS)", placeholder: "(555) 123-4567" },
  { value: "email", label: "Email", placeholder: "you@business.com" },
  { value: "instagram", label: "Instagram DM", placeholder: "@yourbusiness" },
  { value: "messenger", label: "Messenger", placeholder: "your page name" },
];

const EMPTY: Record<Field, string> = {
  nome: "",
  negocio: "",
  siteAtual: "",
  contato: "",
  mensagem: "",
};

function validate(form: Record<Field, string>, canal: CanalEN) {
  const errors: Partial<Record<Field, string>> = {};
  if (!form.nome.trim()) errors.nome = "Please enter your name.";
  if (canal === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contato.trim()))
      errors.contato = "Please enter a valid email.";
  } else if (canal === "sms") {
    if (form.contato.replace(/\D/g, "").length < 10)
      errors.contato = "Please enter a valid phone number.";
  } else if (form.contato.trim().length < 2) {
    errors.contato = "Please enter your handle or page name.";
  }
  if (form.mensagem.trim().length < 10)
    errors.mensagem = "Tell us a bit about your business (one sentence is fine).";
  return errors;
}

export function LeadFormEn() {
  const [form, setForm] = React.useState(EMPTY);
  const [canal, setCanal] = React.useState<CanalEN>("sms");
  const [errors, setErrors] = React.useState<Partial<Record<Field, string>>>({});
  const [submitted, setSubmitted] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [generalError, setGeneralError] = React.useState<string | null>(null);
  const honeypotRef = React.useRef<HTMLInputElement | null>(null);

  const set = (field: Field) => (value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (submitted) setErrors(validate({ ...form, [field]: value }, canal));
  };

  const channel = CHANNELS.find((c) => c.value === canal)!;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    const found = validate(form, canal);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSending(true);
    setGeneralError(null);
    try {
      const result = await criarLead({
        origem: "en",
        website: honeypotRef.current?.value ?? "",
        nome: form.nome,
        negocio: form.negocio.trim() || undefined,
        siteAtual: form.siteAtual.trim() || undefined,
        canal,
        contato: form.contato,
        mensagem: form.mensagem,
      });
      if (!result.ok) {
        setGeneralError("Something went wrong — please try again.");
        return;
      }
      setDone(true);
    } catch {
      setGeneralError("Something went wrong — please try again.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <Card className="rounded-2xl border-white/10 bg-[rgba(10,14,20,0.72)] backdrop-blur-md">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-[rgba(0,255,138,0.9)]" />
          <div className="text-lg font-semibold text-white">Got it!</div>
          <p className="max-w-sm text-sm text-white/70">
            We&apos;ll get back to you soon — by message, of course. Keep an eye
            on your {channel.label}.
          </p>
        </CardContent>
      </Card>
    );
  }

  const field = (
    id: Field,
    label: string,
    input: React.ReactNode
  ) => (
    <div>
      <label htmlFor={`lead-${id === "siteAtual" ? "site" : id}`} className="mb-1.5 block text-sm text-white/60">
        {label}
      </label>
      {input}
      {errors[id] ? (
        <p role="alert" className="mt-1 text-xs text-red-300">
          {errors[id]}
        </p>
      ) : null}
    </div>
  );

  const inputClasses =
    "h-10 w-full rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35";

  return (
    <Card className="rounded-2xl border-white/10 bg-[rgba(10,14,20,0.72)] backdrop-blur-md">
      <CardHeader>
        <CardTitle className="text-white">Get your free concept</CardTitle>
        <CardDescription className="text-white/70">
          Tell us about your business — we&apos;ll send a free homepage concept.
          No strings attached.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="hidden" aria-hidden="true">
            <input
              ref={honeypotRef}
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          {field(
            "nome",
            "Your name",
            <Input
              id="lead-nome"
              value={form.nome}
              onChange={(e) => set("nome")(e.target.value)}
              placeholder="Alex Johnson"
              className={inputClasses}
            />
          )}

          {field(
            "negocio",
            "Business name",
            <Input
              id="lead-negocio"
              value={form.negocio}
              onChange={(e) => set("negocio")(e.target.value)}
              placeholder="Sparkle Car Wash"
              className={inputClasses}
            />
          )}

          {field(
            "siteAtual",
            "Current website (if you have one)",
            <Input
              id="lead-site"
              value={form.siteAtual}
              onChange={(e) => set("siteAtual")(e.target.value)}
              placeholder="yourbusiness.com"
              className={inputClasses}
            />
          )}

          <div>
            <div className="mb-1.5 block text-sm text-white/60">
              How should we reach you?
            </div>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCanal(c.value)}
                  aria-pressed={canal === c.value}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                    canal === c.value
                      ? "border-[rgba(0,229,255,0.5)] bg-[rgba(0,229,255,0.12)] text-white"
                      : "border-white/10 bg-white/5 text-white/55 hover:text-white"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {field(
            "contato",
            "Where to reach you",
            <Input
              id="lead-contato"
              value={form.contato}
              onChange={(e) => set("contato")(e.target.value)}
              placeholder={channel.placeholder}
              className={inputClasses}
            />
          )}

          {field(
            "mensagem",
            "About your business",
            <Textarea
              id="lead-mensagem"
              value={form.mensagem}
              onChange={(e) => set("mensagem")(e.target.value)}
              placeholder="What do you do, and what do you want your website to do for you?"
              className="min-h-[110px] w-full rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
            />
          )}

          <Button
            id="lead-enviar"
            type="submit"
            disabled={sending}
            className="group h-11 w-full rounded-xl border border-white/10 bg-[rgba(0,255,138,0.16)] text-sm font-medium text-white transition-all hover:-translate-y-[1px] hover:bg-[rgba(0,255,138,0.22)]"
          >
            <span className="inline-flex items-center gap-2">
              {sending ? "Sending..." : "Send it — get my free concept"}
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          </Button>

          {generalError ? (
            <p role="alert" className="text-sm text-red-300">
              {generalError}
            </p>
          ) : null}

          <p className="text-xs text-white/45">
            No calls, ever. We reply by message on the channel you pick.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Criar `components/en/rolagem-secao.tsx`**

```tsx
"use client";

import * as React from "react";

/**
 * `/en?section=pricing` rola até a seção — client-side de propósito: ler
 * searchParams no server component tornaria a página dinâmica.
 */
export function RolagemSecao() {
  React.useEffect(() => {
    const secao = new URLSearchParams(window.location.search).get("section");
    if (!secao) return;
    document.getElementById(secao)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return null;
}
```

- [ ] **Step 6: Verificar** — `npm run build` (exit 0; componentes compilam mesmo sem página que os use).

- [ ] **Step 7: Commit**

```bash
git add lib/site-en.ts components/en/ app/globals.css
git commit -m "Site EN: copy, seção de pricing com seletor e formulário de lead"
```

---

### Task 7: Página /en no ar + SEO

**Files:**
- Create: `app/(site-en)/layout.tsx`
- Create: `app/(site-en)/en/page.tsx`
- Create: `app/(site-en)/en/opengraph-image.tsx`
- Modify: `app/(site-pt)/layout.tsx` (hreflang)
- Modify: `app/sitemap.ts` (duas URLs com alternates)
- Modify: `lib/config.ts` (`getPricingEn`)

**Interfaces:**
- Consumes: `RaizHtml` (Task 1); `SITE_EN/INCLUDED_EN/STEPS_EN/FAQ_EN` e componentes `en/*` (Task 6); `parsePricingEn` (Task 2).
- Produces: `getPricingEn(): Promise<PricingEn>` de `@/lib/config` (Task 8 consome); rota `/en` estática; seções com ids `pricing` e `contact` (âncoras usadas na DM e no CTA).

- [ ] **Step 1: `getPricingEn` em `lib/config.ts`**

```ts
import { parsePricingEn, type PricingEn } from "@/lib/dominio/preco-site";

/** Pricing da /en; JSON inválido ou ausente cai no padrão do domínio. */
export async function getPricingEn(): Promise<PricingEn> {
  const [linha] = await db
    .select()
    .from(configuracoes)
    .where(eq(configuracoes.chave, "pricing_en"));
  return parsePricingEn(linha?.valor);
}
```

- [ ] **Step 2: `app/(site-en)/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { RaizHtml } from "@/components/raiz-html";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

export const viewport = {
  themeColor: "#05070b",
  viewportFit: "cover" as const,
};

export default function LayoutSiteEn({ children }: { children: React.ReactNode }) {
  return <RaizHtml lang="en">{children}</RaizHtml>;
}
```

- [ ] **Step 3: `app/(site-en)/en/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  MessageSquareText,
  Moon,
  PenLine,
  ShieldCheck,
} from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { HeroGlow } from "@/components/landing/hero-glow";
import { Card, CardContent } from "@/components/ui/card";

import { getPricingEn } from "@/lib/config";
import { FAQ_EN, INCLUDED_EN, SITE_EN, STEPS_EN } from "@/lib/site-en";
import { PricingSection } from "@/components/en/pricing-section";
import { LeadFormEn } from "@/components/en/lead-form";
import { RolagemSecao } from "@/components/en/rolagem-secao";

export const metadata: Metadata = {
  title: SITE_EN.title,
  description: SITE_EN.description,
  keywords: [...SITE_EN.keywords],
  alternates: {
    canonical: "/en",
    languages: { "pt-BR": "/", en: "/en", "x-default": "/" },
  },
  openGraph: {
    type: "website",
    url: "/en",
    siteName: SITE_EN.name,
    title: SITE_EN.title,
    description: SITE_EN.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_EN.title,
    description: SITE_EN.description,
  },
};

const NO_CALLS = [
  {
    icon: <Moon className="h-5 w-5 text-[rgba(0,229,255,0.95)]" />,
    title: "Reply on your schedule",
    desc: "7 AM or 11 PM — message us whenever suits you. We answer fast.",
  },
  {
    icon: <PenLine className="h-5 w-5 text-[rgba(0,255,138,0.9)]" />,
    title: "Everything in writing",
    desc: "Every decision documented. Nothing gets lost in a call.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5 text-white/90" />,
    title: "No sales pressure",
    desc: "No pitch meetings. See the concept, decide when you're ready.",
  },
] as const;

export default async function PaginaEn() {
  const pricing = await getPricingEn();

  return (
    <main className="relative min-h-screen bg-[#05070b] text-white">
      {/* topo */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 md:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#00E5FF] to-[#00FF8A] font-mono text-[13px] font-bold text-[#05070B]">
            RV
          </span>
          <span className="text-sm font-semibold tracking-wide">RVLand Devs</span>
        </div>
        <nav className="flex items-center gap-2">
          <a
            href="#pricing"
            className="rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:text-white"
          >
            Pricing
          </a>
          <a
            href="#contact"
            className="rounded-xl border border-white/10 bg-[rgba(0,255,138,0.14)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[rgba(0,255,138,0.2)]"
          >
            Get started
          </a>
        </nav>
      </header>

      {/* hero */}
      <section id="top" className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 md:px-6 md:pb-16">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-8 md:p-14">
          <HeroGlow />
          <div className="relative max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/60">
              <MessageSquareText className="h-3.5 w-3.5" />
              Websites for small businesses
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
              A website that wins you customers.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/70">
              We design it, write it, and put it live — you approve everything
              from your phone. No calls. No meetings. No tech headaches.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#contact"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[rgba(0,255,138,0.16)] px-6 text-sm font-medium transition-all hover:-translate-y-[1px] hover:bg-[rgba(0,255,138,0.22)]"
              >
                Get your free concept
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#pricing"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                See pricing
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* no calls */}
      <section id="no-calls" className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <Reveal>
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              No calls. No meetings.{" "}
              <span className="bg-gradient-to-r from-[#00E5FF] to-[#00FF8A] bg-clip-text text-transparent">
                Just text.
              </span>
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-white/65">
              You&apos;re busy running a business — not sitting on Zoom. Message
              us, approve the design, and your site goes live. That&apos;s it.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {NO_CALLS.map((item) => (
              <Card
                key={item.title}
                className="rounded-2xl border-white/10 bg-white/5 backdrop-blur-md"
              >
                <CardContent className="p-6">
                  <div className="mb-3">{item.icon}</div>
                  <div className="font-medium text-white">{item.title}</div>
                  <p className="mt-1.5 text-sm text-white/60">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Reveal>
      </section>

      {/* what's included */}
      <section id="included" className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <Reveal>
          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Everything your site needs. Included.
            </h2>
            <p className="mt-2 max-w-2xl text-white/65">
              One package, no add-ons, no surprise invoices.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {INCLUDED_EN.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
              >
                <div className="text-sm font-medium text-white">{item.title}</div>
                <p className="mt-1 text-sm text-white/55">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm text-white/55">
            Every plan includes 12 months of support &amp; hosting. After that,
            it&apos;s just $79/month.
          </p>
        </Reveal>
      </section>

      {/* how it works */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <Reveal>
          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              How it works
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS_EN.map((step, i) => (
              <div
                key={step.title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"
              >
                <div className="rv-num mb-3 text-sm text-[rgba(0,229,255,0.9)]">
                  0{i + 1}
                </div>
                <div className="font-medium text-white">{step.title}</div>
                <p className="mt-1.5 text-sm text-white/60">{step.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* pricing */}
      <section id="pricing" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-10 md:px-6 md:py-14">
        <Reveal>
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Simple pricing. Everything included.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-white/65">
              One website, three ways to pay.
            </p>
          </div>
          <PricingSection pricing={pricing} />
        </Reveal>
      </section>

      {/* faq */}
      <section id="faq" className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <Reveal>
          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Questions, answered
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {FAQ_EN.map((item) => (
              <div
                key={item.q}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
              >
                <div className="font-medium text-white">{item.q}</div>
                <p className="mt-1.5 text-sm text-white/60">{item.a}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* contact */}
      <section id="contact" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-10 pb-16 md:px-6 md:py-14">
        <Reveal>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Get your free concept
              </h2>
              <p className="mt-3 max-w-md text-white/65">
                Send us your info and we&apos;ll reply with a free homepage
                concept for your business — before you pay anything.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-white/70">
                <li className="flex items-start gap-2">
                  <span className="mt-[7px] inline-block h-1.5 w-1.5 rounded-full bg-[rgba(0,255,138,0.85)]" />
                  We reply by message on the channel you pick.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-[7px] inline-block h-1.5 w-1.5 rounded-full bg-[rgba(0,255,138,0.85)]" />
                  Free concept — you only pay if you love it.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-[7px] inline-block h-1.5 w-1.5 rounded-full bg-[rgba(0,255,138,0.85)]" />
                  No calls, no meetings — that&apos;s a promise.
                </li>
              </ul>
            </div>
            <LeadFormEn />
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-white/45 md:flex-row md:px-6">
          <span>© {new Date().getFullYear()} RVLand Devs</span>
          <Link href="/" className="transition-colors hover:text-white">
            Português (Brasil) →
          </Link>
        </div>
      </footer>

      <RolagemSecao />
    </main>
  );
}
```

- [ ] **Step 4: `app/(site-en)/en/opengraph-image.tsx`**

Mesma estrutura visual do OG PT (gradiente, régua, fontes), com textos:
- tagline: `WEBSITES FOR SMALL BUSINESSES`
- nome: `RVLand Devs`
- linha verde: `No calls. Just text. Live in days.`
- rodapé: `Design · Copy · Hosting · Support`
- `export const alt = "RVLand Devs — Websites for small businesses";`

Copiar `app/(site-pt)/opengraph-image.tsx` e substituir os quatro textos e o `alt`; `size`/`contentType` iguais.

- [ ] **Step 5: hreflang no PT + sitemap**

Em `app/(site-pt)/layout.tsx`, trocar `alternates` por:

```ts
alternates: {
  canonical: "/",
  languages: { "pt-BR": "/", en: "/en", "x-default": "/" },
},
```

`app/sitemap.ts` completo:

```ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = { "pt-BR": SITE_URL, en: `${SITE_URL}/en` };
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
      alternates: { languages },
    },
    {
      url: `${SITE_URL}/en`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.9,
      alternates: { languages },
    },
  ];
}
```

- [ ] **Step 6: Verificar**

```bash
npm run build
```
Esperado: `○ /en` (estática) na tabela. Depois:

```bash
npx next start -p 3100 & sleep 3
curl -s http://localhost:3100/en | grep -o 'hreflang="[^"]*"' | sort -u
curl -s http://localhost:3100/ | grep -o 'hreflang="[^"]*"' | sort -u
curl -s http://localhost:3100/sitemap.xml | head -20
kill %1
```
Esperado: hreflang `pt-BR`, `en` e `x-default` nas duas páginas; sitemap com as duas URLs.

- [ ] **Step 7: Commit**

```bash
git add "app/(site-en)" "app/(site-pt)/layout.tsx" app/sitemap.ts lib/config.ts
git commit -m "Página /en no ar: layout EN, OG próprio, hreflang e sitemap"
```

---

### Task 8: Painel — permissões novas + tela Preços do site

**Files:**
- Modify: `lib/dominio/permissoes.ts` (3 permissões novas)
- Create: `app/(app)/painel/config/precos-site/page.tsx`
- Create: `app/(app)/painel/config/precos-site/actions.ts`
- Create: `components/painel/form-precos-site.tsx`
- Modify: `app/(app)/painel/config/page.tsx` (card "Site")

**Interfaces:**
- Consumes: `getPricingEn`/`setConfig` (`@/lib/config`), `esquemaPricingEn` (Task 2), `dolaresParaCentavos` (Task 2), `InputDolar` (Task 2), `mascararDinheiroUS` (Task 2).
- Produces: permissões `leads.ver`, `leads.editar`, `site.precos` no catálogo (Task 9 consome as de leads); `salvarPrecosSite(estado: EstadoPrecos, formData: FormData): Promise<EstadoPrecos>` com `EstadoPrecos = { ok?: string; erro?: string }`.

- [ ] **Step 1: Catálogo de permissões**

Em `lib/dominio/permissoes.ts`, acrescentar ao array `PERMISSOES` (depois do bloco "Agente"):

```ts
  { chave: "leads.ver", rotulo: "Ver leads", area: "Leads" },
  { chave: "leads.editar", rotulo: "Editar leads (status e notas)", area: "Leads" },

  { chave: "site.precos", rotulo: "Editar preços do site (/en)", area: "Site" },
```

- [ ] **Step 2: `app/(app)/painel/config/precos-site/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";

import { exigirPermissao } from "@/lib/auth";
import { getPricingEn, setConfig } from "@/lib/config";
import { registrarAuditoria } from "@/lib/audit";
import { dolaresParaCentavos } from "@/lib/formato";
import { esquemaPricingEn } from "@/lib/dominio/preco-site";

export type EstadoPrecos = { ok?: string; erro?: string };

export async function salvarPrecosSite(
  _estado: EstadoPrecos,
  formData: FormData
): Promise<EstadoPrecos> {
  const perfil = await exigirPermissao("site.precos");

  const centavos = (campo: string) => dolaresParaCentavos(String(formData.get(campo) ?? ""));
  const ligado = (campo: string) => formData.get(campo) === "on";

  const candidato = {
    moeda: "USD",
    planos: {
      full: { ativo: ligado("full_ativo"), valorCentavos: centavos("full_valor") },
      m6: { ativo: ligado("m6_ativo"), valorCentavos: centavos("m6_valor"), parcelas: 6 },
      m12: { ativo: ligado("m12_ativo"), valorCentavos: centavos("m12_valor"), parcelas: 12 },
    },
    care: {
      valorCentavos: centavos("care_valor"),
      mesesInclusos: Number(formData.get("care_meses")),
    },
  };

  const dados = esquemaPricingEn.safeParse(candidato);
  if (!dados.success) return { erro: "Valores inválidos — confira os campos." };
  if (
    !dados.data.planos.full.ativo &&
    !dados.data.planos.m6.ativo &&
    !dados.data.planos.m12.ativo
  ) {
    return { erro: "Pelo menos um plano precisa ficar ativo." };
  }

  const anterior = await getPricingEn();
  await setConfig("pricing_en", dados.data as Record<string, unknown>);

  await registrarAuditoria({
    ator: perfil,
    acao: "site.precos_alterados",
    entidade: "plataforma",
    detalhes: { de: anterior, para: dados.data },
  });

  revalidatePath("/en");
  return { ok: "Preços salvos — /en atualizada." };
}
```

- [ ] **Step 3: `components/painel/form-precos-site.tsx`**

```tsx
"use client";

import { useActionState } from "react";

import { Btn } from "@/components/painel/ui";
import { InputDolar } from "@/components/painel/inputs-mascarados";
import type { PricingEn } from "@/lib/dominio/preco-site";
import type { EstadoPrecos } from "@/app/(app)/painel/config/precos-site/actions";

export function FormPrecosSite({
  acao,
  atual,
}: {
  acao: (estado: EstadoPrecos, formData: FormData) => Promise<EstadoPrecos>;
  atual: PricingEn;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoPrecos, FormData>(acao, {});

  const planos = [
    {
      campo: "full",
      titulo: "Pay in full",
      detalhe: "pagamento único",
      valor: atual.planos.full.valorCentavos,
      ativo: atual.planos.full.ativo,
    },
    {
      campo: "m6",
      titulo: "6 months",
      detalhe: "6 parcelas mensais",
      valor: atual.planos.m6.valorCentavos,
      ativo: atual.planos.m6.ativo,
    },
    {
      campo: "m12",
      titulo: "12 months",
      detalhe: "12 parcelas mensais",
      valor: atual.planos.m12.valorCentavos,
      ativo: atual.planos.m12.ativo,
    },
  ] as const;

  return (
    <form action={dispatch} className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {planos.map((p) => (
          <div key={p.campo} className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-white">{p.titulo}</div>
                <div className="text-xs text-white/40">{p.detalhe}</div>
              </div>
              <label className="flex items-center gap-2 text-xs text-white/60">
                <input type="checkbox" name={`${p.campo}_ativo`} defaultChecked={p.ativo} />
                ativo
              </label>
            </div>
            <InputDolar name={`${p.campo}_valor`} defaultValue={String(p.valor)} required />
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 md:grid-cols-2">
        <div>
          <label className="rv-eyebrow mb-2 block" htmlFor="care_valor">
            support &amp; hosting mensal (após o período incluso)
          </label>
          <InputDolar id="care_valor" name="care_valor" defaultValue={String(atual.care.valorCentavos)} required />
        </div>
        <div>
          <label className="rv-eyebrow mb-2 block" htmlFor="care_meses">
            meses inclusos em todos os planos
          </label>
          <input
            id="care_meses"
            name="care_meses"
            type="number"
            min={1}
            max={36}
            defaultValue={atual.care.mesesInclusos}
            required
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Btn type="submit" variante="primario" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar e atualizar /en"}
        </Btn>
        {estado.erro ? (
          <p role="alert" className="text-xs text-red-300">{estado.erro}</p>
        ) : null}
        {estado.ok ? <p className="text-xs text-emerald-300">{estado.ok}</p> : null}
      </div>
    </form>
  );
}
```

- [ ] **Step 4: `app/(app)/painel/config/precos-site/page.tsx`**

```tsx
import { exigirPermissao } from "@/lib/auth";
import { getPricingEn } from "@/lib/config";
import { salvarPrecosSite } from "./actions";
import { PageHeader } from "@/components/painel/page-header";
import { FormPrecosSite } from "@/components/painel/form-precos-site";

export const metadata = { title: "Preços do site" };

export default async function PaginaPrecosSite() {
  await exigirPermissao("site.precos");
  const pricing = await getPricingEn();

  return (
    <>
      <PageHeader
        trilha="config / preços do site"
        titulo="Preços do site (/en)"
        descricao="O que o público internacional vê na seção de pricing. Salvar publica na hora."
      />
      <div className="rv-entrar-1">
        <FormPrecosSite acao={salvarPrecosSite} atual={pricing} />
      </div>
    </>
  );
}
```

- [ ] **Step 5: Card "Site" em `app/(app)/painel/config/page.tsx`**

Importar `CircleDollarSign` do lucide, calcular `const podePrecos = pode(perfil, "site.precos");` e acrescentar depois do card "Acesso":

```tsx
{podePrecos ? (
  <Card>
    <CardHeader>
      <CardTitle className="text-base text-white">Site</CardTitle>
    </CardHeader>
    <CardContent>
      <Link
        href="/painel/config/precos-site"
        className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80 transition-colors hover:bg-black/30"
      >
        <CircleDollarSign className="h-4 w-4" />
        Preços do site (/en)
      </Link>
    </CardContent>
  </Card>
) : null}
```

- [ ] **Step 6: Verificar** — `npm run build` exit 0; `npm test` verde (o catálogo tem teste em `permissoes.test.ts` — se ele valida contagem/formato, ajustar o teste para as 3 novas chaves).

- [ ] **Step 7: Commit**

```bash
git add lib/dominio/permissoes.ts "app/(app)/painel/config" components/painel/form-precos-site.tsx
git commit -m "Painel: permissões novas e tela Preços do site (/en)"
```

---

### Task 9: Painel — aba Leads

**Files:**
- Create: `app/(app)/painel/leads/page.tsx`
- Create: `app/(app)/painel/leads/[id]/page.tsx`
- Create: `app/(app)/painel/leads/actions.ts`
- Create: `components/painel/form-lead.tsx`
- Create: `components/painel/badge-lead.tsx`
- Modify: `app/(app)/painel/layout.tsx` (item de nav), `components/painel/sidebar.tsx` e `components/painel/drawer-movel.tsx` (ícone `leads`)

**Interfaces:**
- Consumes: `leads` (Task 4); `STATUS_LEAD`, `rotuloCanal`, `linkContato` (Task 3); permissões `leads.ver`/`leads.editar` (Task 8); `formatarDataHoraBR`.
- Produces: `atualizarLead(leadId: string, estado: EstadoLead, formData: FormData): Promise<EstadoLead>` com `EstadoLead = { ok?: string; erro?: string }`; `BadgeLead({ status })`; item de navegação "Leads" (`icone: "leads"` → lucide `Inbox`).

- [ ] **Step 1: `app/(app)/painel/leads/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, leads } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { STATUS_LEAD } from "@/lib/dominio/leads";

export type EstadoLead = { ok?: string; erro?: string };

const esquemaAtualizacao = z.object({
  status: z.enum(STATUS_LEAD),
  notas: z.string().trim().max(8000).optional(),
});

export async function atualizarLead(
  leadId: string,
  _estado: EstadoLead,
  formData: FormData
): Promise<EstadoLead> {
  const perfil = await exigirPermissao("leads.editar");

  const dados = esquemaAtualizacao.safeParse({
    status: formData.get("status"),
    notas: String(formData.get("notas") ?? "").trim() || undefined,
  });
  if (!dados.success) return { erro: "Status inválido." };

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) return { erro: "Lead não encontrado." };

  await db
    .update(leads)
    .set({
      status: dados.data.status,
      notas: dados.data.notas ?? null,
      atualizadoEm: new Date(),
    })
    .where(eq(leads.id, leadId));

  if (lead.status !== dados.data.status) {
    await registrarAuditoria({
      ator: perfil,
      acao: "lead.status_alterado",
      entidade: "lead",
      entidadeId: leadId,
      detalhes: { de: lead.status, para: dados.data.status },
    });
  }

  revalidatePath(`/painel/leads/${leadId}`);
  revalidatePath("/painel/leads");
  return { ok: "Lead atualizado." };
}
```

- [ ] **Step 2: `components/painel/badge-lead.tsx`**

```tsx
import { cn } from "@/lib/utils";
import type { StatusLead } from "@/lib/dominio/leads";

const MAPA: Record<StatusLead, { rotulo: string; classe: string }> = {
  novo: {
    rotulo: "Novo",
    classe: "border-[rgba(0,229,255,0.25)] bg-[rgba(0,229,255,0.08)] text-[#8AF0FF]",
  },
  em_conversa: {
    rotulo: "Em conversa",
    classe: "border-white/15 bg-white/5 text-white/80",
  },
  proposta: {
    rotulo: "Proposta",
    classe: "border-[rgba(255,194,77,0.25)] bg-[rgba(255,194,77,0.08)] text-[#FFD58A]",
  },
  ganho: {
    rotulo: "Ganho",
    classe: "border-[rgba(0,255,138,0.25)] bg-[rgba(0,255,138,0.08)] text-[#7DFFC4]",
  },
  perdido: {
    rotulo: "Perdido",
    classe: "border-white/10 bg-white/[0.03] text-white/35",
  },
};

export function BadgeLead({ status }: { status: StatusLead }) {
  const m = MAPA[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        m.classe
      )}
    >
      {m.rotulo}
    </span>
  );
}
```

- [ ] **Step 3: `components/painel/form-lead.tsx`**

```tsx
"use client";

import * as React from "react";
import { useActionState } from "react";

import { Btn } from "@/components/painel/ui";
import { SelectRico } from "@/components/painel/select-rico";
import { STATUS_LEAD, type StatusLead } from "@/lib/dominio/leads";
import type { EstadoLead } from "@/app/(app)/painel/leads/actions";

const ROTULOS: Record<StatusLead, string> = {
  novo: "Novo",
  em_conversa: "Em conversa",
  proposta: "Proposta",
  ganho: "Ganho",
  perdido: "Perdido",
};

export function FormLead({
  acao,
  statusAtual,
  notasAtuais,
}: {
  acao: (estado: EstadoLead, formData: FormData) => Promise<EstadoLead>;
  statusAtual: StatusLead;
  notasAtuais: string;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoLead, FormData>(acao, {});
  const [status, setStatus] = React.useState<string>(statusAtual);

  return (
    <form action={dispatch} className="space-y-4">
      <div>
        <label className="rv-eyebrow mb-2 block" htmlFor="status">
          status
        </label>
        <SelectRico
          id="status"
          name="status"
          value={status}
          onValueChange={setStatus}
          opcoes={STATUS_LEAD.map((s) => ({ valor: s, titulo: ROTULOS[s] }))}
        />
      </div>
      <div>
        <label className="rv-eyebrow mb-2 block" htmlFor="notas">
          notas
        </label>
        <textarea
          id="notas"
          name="notas"
          rows={5}
          defaultValue={notasAtuais}
          placeholder="Contexto da conversa, próximos passos..."
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Btn type="submit" variante="primario" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar"}
        </Btn>
        {estado.erro ? (
          <p role="alert" className="text-xs text-red-300">{estado.erro}</p>
        ) : null}
        {estado.ok ? <p className="text-xs text-emerald-300">{estado.ok}</p> : null}
      </div>
    </form>
  );
}
```

- [ ] **Step 4: `app/(app)/painel/leads/page.tsx`**

```tsx
import Link from "next/link";
import { desc } from "drizzle-orm";
import { ArrowUpRight, Inbox } from "lucide-react";

import { db, leads } from "@/lib/db";
import { exigirPermissao } from "@/lib/auth";
import { PageHeader } from "@/components/painel/page-header";
import { BadgeLead } from "@/components/painel/badge-lead";
import { Btn, EmptyState } from "@/components/painel/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { rotuloCanal, STATUS_LEAD } from "@/lib/dominio/leads";
import { formatarDataHoraBR } from "@/lib/formato";

export const metadata = { title: "Leads" };

const ROTULOS_STATUS: Record<string, string> = {
  novo: "Novos",
  em_conversa: "Em conversa",
  proposta: "Proposta",
  ganho: "Ganhos",
  perdido: "Perdidos",
};

export default async function PaginaLeads({
  searchParams,
}: {
  searchParams: Promise<{ origem?: string; status?: string }>;
}) {
  await exigirPermissao("leads.ver");
  const { origem: filtroOrigem, status: filtroStatus } = await searchParams;

  const linhas = await db.select().from(leads).orderBy(desc(leads.criadoEm)).limit(500);
  const filtrados = linhas.filter((l) => {
    if (filtroOrigem && l.origem !== filtroOrigem) return false;
    if (filtroStatus && l.status !== filtroStatus) return false;
    return true;
  });

  const novos = linhas.filter((l) => l.status === "novo").length;

  return (
    <>
      <PageHeader
        trilha="leads"
        titulo="Leads"
        descricao={`${linhas.length} lead(s) no total — ${novos} novo(s) aguardando resposta.`}
      />

      <form className="rv-entrar-1 mb-5 flex flex-wrap items-center gap-2" action="/painel/leads">
        <select name="origem" defaultValue={filtroOrigem ?? ""} className="!w-full sm:!w-44">
          <option value="">Todas as origens</option>
          <option value="br">Brasil (site PT)</option>
          <option value="en">Exterior (/en)</option>
        </select>
        <select name="status" defaultValue={filtroStatus ?? ""} className="!w-full sm:!w-44">
          <option value="">Todos os status</option>
          {STATUS_LEAD.map((s) => (
            <option key={s} value={s}>
              {ROTULOS_STATUS[s]}
            </option>
          ))}
        </select>
        <Btn type="submit" className="max-sm:w-full">Filtrar</Btn>
      </form>

      <div className="rv-entrar-2">
        {filtrados.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
            <EmptyState
              icone={<Inbox />}
              titulo="Nenhum lead no filtro"
              dica="Leads dos formulários do site (PT e /en) aparecem aqui na hora."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recebido</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Negócio</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((l) => (
                <TableRow key={l.id}>
                  <TableCell rotulo="recebido" className="rv-num text-white/55">
                    {formatarDataHoraBR(l.criadoEm)}
                  </TableCell>
                  <TableCell rotulo="nome" className="font-medium text-white">
                    {l.nome}
                  </TableCell>
                  <TableCell rotulo="negócio" className="text-white/55">
                    {l.negocio ?? "—"}
                  </TableCell>
                  <TableCell rotulo="origem">
                    <span className="rv-num rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] uppercase text-white/70">
                      {l.origem}
                    </span>
                  </TableCell>
                  <TableCell rotulo="canal" className="text-white/70">
                    {rotuloCanal[l.canal]}
                  </TableCell>
                  <TableCell rotulo="contato" className="rv-num text-white/70">
                    {l.contato}
                  </TableCell>
                  <TableCell rotulo="status">
                    <BadgeLead status={l.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Btn asChild tamanho="sm" className="max-md:w-full">
                      <Link href={`/painel/leads/${l.id}`}>
                        Abrir
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    </Btn>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 5: `app/(app)/painel/leads/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowUpRight } from "lucide-react";

import { db, leads } from "@/lib/db";
import { exigirPermissao, pode } from "@/lib/auth";
import { atualizarLead } from "../actions";
import { PageHeader } from "@/components/painel/page-header";
import { BadgeLead } from "@/components/painel/badge-lead";
import { FormLead } from "@/components/painel/form-lead";
import { Btn } from "@/components/painel/ui";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { linkContato, rotuloCanal } from "@/lib/dominio/leads";
import { formatarDataHoraBR } from "@/lib/formato";

export const metadata = { title: "Lead" };

export default async function PaginaLead({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const perfil = await exigirPermissao("leads.ver");
  const { id } = await params;

  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) notFound();

  const podeEditar = pode(perfil, "leads.editar");
  const acao = atualizarLead.bind(null, lead.id);

  const info = (rotulo: string, valor: React.ReactNode) => (
    <div>
      <div className="rv-eyebrow mb-1">{rotulo}</div>
      <div className="text-sm text-white/85">{valor}</div>
    </div>
  );

  return (
    <>
      <PageHeader
        trilha="leads / detalhe"
        titulo={lead.nome}
        descricao={lead.negocio ?? undefined}
        acoes={
          <Btn asChild variante="primario">
            <a href={linkContato(lead.canal, lead.contato)} target="_blank" rel="noreferrer">
              Abrir no {rotuloCanal[lead.canal]}
              <ArrowUpRight className="size-4" />
            </a>
          </Btn>
        }
      />

      <div className="rv-entrar-1 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base text-white">
              Dados do lead
              <BadgeLead status={lead.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {info(
              "origem",
              lead.origem === "en" ? "Exterior (/en)" : "Brasil (site PT)"
            )}
            {info("canal preferido", rotuloCanal[lead.canal])}
            {info("contato", <span className="rv-num">{lead.contato}</span>)}
            {lead.siteAtual
              ? info(
                  "site atual",
                  <a
                    href={
                      lead.siteAtual.startsWith("http")
                        ? lead.siteAtual
                        : `https://${lead.siteAtual}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#8AF0FF] hover:underline"
                  >
                    {lead.siteAtual}
                  </a>
                )
              : null}
            {info("recebido em", <span className="rv-num">{formatarDataHoraBR(lead.criadoEm)}</span>)}
            {info(
              "mensagem",
              <p className="whitespace-pre-wrap rounded-xl border border-white/8 bg-black/20 p-3 text-white/80">
                {lead.mensagem}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-white">Acompanhamento</CardTitle>
          </CardHeader>
          <CardContent>
            {podeEditar ? (
              <FormLead
                acao={acao}
                statusAtual={lead.status}
                notasAtuais={lead.notas ?? ""}
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-white/60">
                {lead.notas ?? "Sem notas."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Navegação**

`app/(app)/painel/layout.tsx` — depois do bloco de Clientes:

```ts
if (pode(perfil, "leads.ver")) {
  itens.push({ href: "/painel/leads", rotulo: "Leads", icone: "leads" });
}
```

`components/painel/sidebar.tsx` — importar `Inbox` do lucide; no type `ItemNav`, a união de `icone` ganha `| "leads"`; no objeto `ICONES`, acrescentar `leads: Inbox`. Mesma mudança no `ICONES` de `components/painel/drawer-movel.tsx` (importar `Inbox`).

- [ ] **Step 7: Verificar** — `npm run build` exit 0.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/painel/leads" "app/(app)/painel/layout.tsx" components/painel/form-lead.tsx components/painel/badge-lead.tsx components/painel/sidebar.tsx components/painel/drawer-movel.tsx
git commit -m "Painel: aba Leads com filtros, detalhe e notas"
```

---

### Task 10: Validação ponta a ponta

**Files:**
- Create: `scripts/validar-site.mjs`

**Interfaces:**
- Consumes: ids/rótulos estáveis definidos nas Tasks 5 e 6 (`#nome`, `#contato`, `#mensagem`, `#enviar-lead`, pill "Instagram" no PT; `#lead-*`, `#lead-enviar`, pill "Text (SMS)", texto "Got it" no EN); login via `SEED_ADMIN_EMAIL`/`SEED_ADMIN_SENHA` do `.env.local` (mesmo mecanismo do `validar-visual.mjs`).

- [ ] **Step 1: Criar `scripts/validar-site.mjs`**

```js
/* Validação do site público: /, /en (desktop e mobile), rolagem de
   ?section=pricing, seletor de preços, e os dois formulários gerando lead
   visível no painel. Sai com código 1 se qualquer checagem falhar. */
import { readFileSync, mkdirSync } from "node:fs";

const { chromium } = await import("playwright");
const SAIDA = process.argv[2] ?? ".playwright-fotos-site";
const BASE = "http://localhost:3000";
mkdirSync(SAIDA, { recursive: true });

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const browser = await chromium.launch();
const falhas = [];
const marca = Date.now().toString().slice(-6);

async function novaPagina(viewport) {
  const page = await browser.newPage({ viewport });
  page.on("console", (m) => {
    // pixel da Meta sem ID configurado gera ruído conhecido — ignorar
    if (m.type() === "error" && !/facebook|fbevents/i.test(m.text()))
      falhas.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => falhas.push(`pageerror: ${e}`));
  return page;
}

async function foto(page, nome, fullPage = false) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SAIDA}/${nome}.png`, fullPage });
  console.log(`foto: ${nome}`);
}

// ── desktop ──────────────────────────────────────────────────────────────
const page = await novaPagina({ width: 1440, height: 900 });

await page.goto(`${BASE}/`);
await foto(page, "pt-desktop", true);

await page.goto(`${BASE}/en`);
await foto(page, "en-desktop", true);

// ?section=pricing rola até a seção
await page.goto(`${BASE}/en?section=pricing`);
await page.waitForTimeout(1500);
const pertoDoPricing = await page.evaluate(() => {
  const el = document.getElementById("pricing");
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.top > -300 && r.top < window.innerHeight;
});
if (!pertoDoPricing) falhas.push("/en?section=pricing não rolou até #pricing");
await foto(page, "en-pricing-scroll");

// seletor de pricing troca valores
await page.click("#pricing button:has-text('6 months')");
await page.waitForTimeout(400);
const texto6 = await page.locator("#pricing").textContent();
if (!texto6?.includes("/mo")) falhas.push("seleção '6 months' não mostrou valor mensal");
await foto(page, "en-pricing-6m");

// formulário EN → lead
await page.goto(`${BASE}/en`);
await page.fill("#lead-nome", `Playwright EN ${marca}`);
await page.fill("#lead-negocio", "Sparkle Car Wash");
await page.click("#contact button:has-text('Text (SMS)')");
await page.fill("#lead-contato", "5551234567");
await page.fill("#lead-mensagem", "Automated validation lead — safe to delete.");
await page.click("#lead-enviar");
try {
  await page.waitForSelector("text=Got it", { timeout: 15000 });
} catch {
  falhas.push("formulário EN não mostrou confirmação");
}
await foto(page, "en-form-ok");

// formulário PT → lead (canal Instagram: não abre wa/mailto no headless)
await page.goto(`${BASE}/#contato`);
await page.fill("#nome", `Playwright BR ${marca}`);
await page.click("section#contato button:has-text('Instagram')");
await page.fill("#contato", "@rvland.validacao");
await page.fill("#mensagem", "Lead de validação automática — pode apagar.");
await page.click("#enviar-lead");
try {
  await page.waitForSelector("text=Recebido", { timeout: 15000 });
} catch {
  falhas.push("formulário PT não mostrou confirmação");
}
await foto(page, "pt-form-ok");

// ── mobile ───────────────────────────────────────────────────────────────
const movel = await novaPagina({ width: 390, height: 844 });
await movel.goto(`${BASE}/en`);
await foto(movel, "en-mobile", true);
await movel.goto(`${BASE}/`);
await foto(movel, "pt-mobile", true);
await movel.close();

// ── painel: leads chegaram ───────────────────────────────────────────────
await page.goto(`${BASE}/login`);
await page.fill("#email", env.SEED_ADMIN_EMAIL);
await page.fill("#senha", env.SEED_ADMIN_SENHA);
await page.click("button[type=submit]");
await page.waitForURL("**/painel", { timeout: 30000 });

await page.goto(`${BASE}/painel/leads`);
await page.waitForTimeout(800);
const corpo = await page.textContent("body");
if (!corpo?.includes(`Playwright EN ${marca}`)) falhas.push("lead EN não apareceu no painel");
if (!corpo?.includes(`Playwright BR ${marca}`)) falhas.push("lead BR não apareceu no painel");
await foto(page, "painel-leads", true);

await page.click("table a:has-text('Abrir')");
await page.waitForURL("**/painel/leads/**");
await foto(page, "painel-lead-detalhe", true);

// tela de preços do site
await page.goto(`${BASE}/painel/config/precos-site`);
await foto(page, "painel-precos-site", true);

await browser.close();

if (falhas.length > 0) {
  console.error("FALHAS:\n" + falhas.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
console.log("validação do site: OK");
```

- [ ] **Step 2: Rodar tudo**

```bash
npm test
npm run build          # conferir: ○ / e ○ /en estáticas; /painel/leads e /painel/config/precos-site presentes
npx next start & sleep 3
node scripts/validar-site.mjs
node scripts/validar-visual.mjs .playwright-fotos-regressao   # painel intacto pós-migração
kill %1
```
Esperado: vitest verde; build com `/` e `/en` estáticas; `validação do site: OK`; validar-visual termina sem erro. Olhar as fotos geradas (desktop + mobile) antes de dar por encerrado.

- [ ] **Step 3: Limpar os leads de validação** (opcional, manter o banco limpo)

```bash
npx tsx -e "
import { config } from 'dotenv'; config({ path: '.env.local' });
const { like } = await import('drizzle-orm');
const { db, leads } = await import('./lib/db');
await db.delete(leads).where(like(leads.nome, 'Playwright %'));
console.log('leads de validação removidos');
process.exit(0);
"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/validar-site.mjs
git commit -m "Validação: Playwright do site público e leads ponta a ponta"
```

---

## Depois da execução

1. Apresentar ao João a copy EN publicada (hero, no-calls, how it works, FAQ, pricing) para revisão — mudanças são só texto.
2. Lembrar: para o pricing aparecer diferente do padrão, é só salvar na tela nova (Configurações → Preços do site); o primeiro salvamento cria a chave `pricing_en`.
3. Deploy: merge de `plataforma` → `main` quando o João aprovar (produção deploya da main).
