# RVLand Devs — site

Landing page institucional da RVLand Devs. Next.js 16 (App Router) + Tailwind v4 +
shadcn/ui, hospedada na Vercel.

## Rodando

```bash
npm install
cp .env.example .env.local   # ajuste os valores
npm run dev
```

- `npm run dev` — desenvolvimento em http://localhost:3000
- `npm run build` — build de produção
- `npm run lint` — ESLint

## Variáveis de ambiente

Ver [`.env.example`](.env.example). Nenhuma é obrigatória para rodar local: o site
cai em defaults sensatos e o Meta Pixel simplesmente não carrega se o ID estiver
vazio.

## Estrutura

```
app/
  layout.tsx           metadata global, lang pt-BR, fontes
  page.tsx             landing (Server Component) + JSON-LD
  globals.css          tema shadcn + animações da landing
  opengraph-image.tsx  card social 1200x630 gerado em build
  sitemap.ts robots.ts
components/
  landing/             ilhas interativas ("use client")
  ui/                  primitivos shadcn/ui
lib/
  site.ts              fonte única: contato, SEO, FAQ, helpers de link
```

### Por que a landing é Server Component

Só os pedaços que precisam de evento de mouse ou `IntersectionObserver` vivem em
`components/landing/` com `"use client"`. O resto é HTML renderizado no servidor —
menos JS no cliente e conteúdo indexável sem depender de hidratação.

### Animação de entrada sem quebrar no-JS

Os blocos usam a classe `.rv-reveal`, que é **visível por padrão**. Um script
bloqueante no `layout.tsx` adiciona `.js` ao `<html>`, e só então o CSS esconde os
blocos para que o `Reveal` os anime. Sem JS, a página continua legível.

Se for mexer nisso: nunca coloque o estado escondido direto no `className` do JSX,
senão o HTML servido volta a nascer invisível.

## Pendências conhecidas

- O formulário de contato abre `mailto:`/WhatsApp; não persiste o lead em lugar
  nenhum. Trocar por Server Action + banco quando houver backend.
- O Meta Pixel dispara `PageView` sem camada de consentimento (LGPD).
