# RVLand Devs — site + plataforma

Landing page institucional **e** central interna de gestão de clientes
recorrentes (`/painel`). Next.js 16 (App Router) + Tailwind v4 + shadcn/ui +
Supabase (Postgres/Auth/Storage) + Drizzle, hospedado na Vercel.

Documentos de projeto: spec em
[docs/superpowers/specs/](docs/superpowers/specs/) e plano em
[docs/superpowers/plans/](docs/superpowers/plans/).

## Rodando

```bash
npm install
cp .env.example .env.local   # ajuste os valores
npm run dev
```

- `npm run dev` — desenvolvimento em http://localhost:3000
- `npm run build` — build de produção
- `npm run lint` — ESLint
- `npm run test` — testes do domínio (vitest)

## Setup da plataforma (uma vez)

1. Crie um projeto no [Supabase](https://supabase.com) e preencha no
   `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` e `DATABASE_URL` (ver `.env.example`).
2. `npm run db:migrate` — cria as tabelas, liga RLS e cria o bucket privado
   `contratos`.
3. Defina `SEED_ADMIN_EMAIL`, `SEED_ADMIN_SENHA` e `SEED_ADMIN_NOME` no
   `.env.local` e rode `npm run db:seed` — cria os grupos Dono/Financeiro/
   Operação, as configurações padrão e o seu usuário.
4. Acesse `/login`. Usuários seguintes são criados dentro do painel
   (Configurações → Usuários).
5. Na Vercel, configure as mesmas envs + `CRON_SECRET` (o cron diário de
   faturas em `vercel.json` usa esse segredo).

O **modo simulação nasce ligado**: nenhum bloqueio é executado até você
desligar conscientemente em Configurações.

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
