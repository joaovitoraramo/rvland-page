# Plataforma RVLand — Plano de Implementação (Fases 0 e 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Painel interno em `/painel` para gerir clientes recorrentes: cadastro, contratos, cobranças geradas por cron, pagamentos, status de licença derivado, grupos/permissões, auditoria e dashboard-resumo.

**Architecture:** Next.js App Router na Vercel; landing intocada e estática; painel dinâmico protegido por middleware com Supabase Auth (cookies via @supabase/ssr); Postgres do Supabase acessado server-side com Drizzle + postgres-js; escrita por Server Actions validadas com Zod; domínio puro testado com vitest.

**Tech Stack:** Next 16, React 19, Tailwind 4, shadcn/ui existente, drizzle-orm + drizzle-kit, postgres (postgres-js), zod, @supabase/ssr + @supabase/supabase-js, vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-08-16-plataforma-rvland-design.md`

## Global Constraints

- Dinheiro sempre em centavos (int). Datas de negócio como DATE (string `YYYY-MM-DD`); competência = dia 1º do mês.
- Fuso America/Sao_Paulo fixo UTC-3 (Brasil sem DST desde 2019); helpers em `lib/dominio/tempo.ts`, nunca `new Date()` cru para regra de negócio.
- Permissão SEMPRE verificada no servidor (action/page); esconder botão não é segurança. Grupo com `todas_permissoes` passa em tudo.
- `/painel` e `/login` com `robots: { index: false, follow: false }`; nunca citar /painel em robots.txt.
- Faturas `historica=true` nunca influenciam licença nem avisos.
- Nunca editar/apagar vigência de preço passada; nova vigência só em competência futura.
- Textos de UI em pt-BR. Tema escuro (`bg-[#05070b]`, cartões `bg-white/5 border-white/10`), coerente com a landing.
- RLS habilitado em toda tabela, sem policies (REST anônima nega tudo; app usa conexão direta).
- Commits frequentes na branch `plataforma`; nunca push.

---

## FASE 0 — Fundação

### Task 1: Dependências e configuração

**Files:**
- Modify: `package.json` (deps + scripts)
- Create: `drizzle.config.ts`, `vitest.config.ts`, `vercel.json`
- Modify: `.env.example`

- [ ] Instalar: `npm i drizzle-orm postgres zod @supabase/ssr @supabase/supabase-js` e `npm i -D drizzle-kit vitest tsx dotenv`
- [ ] Scripts: `"test": "vitest run"`, `"db:generate": "drizzle-kit generate"`, `"db:migrate": "tsx scripts/migrate.ts"`, `"db:seed": "tsx scripts/seed.ts"`
- [ ] `drizzle.config.ts`: dialect postgresql, schema `./lib/db/schema.ts`, out `./drizzle`, url `process.env.DATABASE_URL` (via dotenv/config).
- [ ] `vitest.config.ts`: alias `@` → raiz; include `lib/**/*.test.ts`.
- [ ] `vercel.json`: cron diário `{"path": "/api/cron/faturas", "schedule": "0 6 * * *"}` (06:00 UTC = 03:00 SP).
- [ ] `.env.example`: adicionar `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` com comentários.
- [ ] Verificar: `npm run lint` e `npm run build` seguem passando. Commit.

### Task 2: Helpers de tempo/competência (TDD)

**Files:**
- Create: `lib/dominio/tempo.ts`, Test: `lib/dominio/tempo.test.ts`

**Interfaces (Produces):**
```ts
hojeSP(agora?: Date): string                 // "YYYY-MM-DD" no fuso SP
competenciaDe(dataISO: string): string       // "2026-08-16" -> "2026-08-01"
competenciaAtual(agora?: Date): string
vencimentoNaCompetencia(competencia: string, dia: number): string // dia 1..28
addDias(dataISO: string, dias: number): string
compararDatas(a: string, b: string): number  // <0 a antes de b
formatarDataBR(dataISO: string): string      // "16/08/2026"
```

- [ ] Testes: conversão de fuso (Date UTC 2026-01-01T01:00Z → hojeSP "2025-12-31"), competência, vencimento com dia 15, addDias virando mês, comparação. Rodar e ver falhar.
- [ ] Implementar com aritmética UTC-3 fixa (sem lib externa). Rodar e ver passar. Commit.

### Task 3: Schema Drizzle + migrations + RLS

**Files:**
- Create: `lib/db/schema.ts`, `lib/db/index.ts`, `scripts/migrate.ts`
- Generate: `drizzle/0000_*.sql` (drizzle-kit) + Create: `drizzle/0001_rls.sql` custom

**Interfaces (Produces):** tabelas exatamente como na seção 5 do spec, nomes em pt: `perfis, grupos, gruposPermissoes, auditoria, configuracoes, clientes, contratos, contratosPrecos, faturas, pagamentos, licencas, anexos`. Enums via `text` com union types TS (`$type<'ativo'|'arquivado'>()`), ids `uuid` default random exceto auditoria `bigserial`. `lib/db/index.ts` exporta `db` (drizzle/postgres-js, `prepare:false` p/ pooler do Supabase) e re-exporta schema.

- [ ] Escrever schema completo (Fases 0+1 numa migration só — o banco ainda não existe).
- [ ] `npm run db:generate`; conferir SQL gerado.
- [ ] `drizzle/0001_rls.sql` (via `drizzle-kit generate --custom`): `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` para todas + `INSERT INTO storage.buckets (id,name,public) VALUES ('contratos','contratos',false) ON CONFLICT DO NOTHING;`
- [ ] `scripts/migrate.ts`: drizzle-orm/postgres-js/migrator com `max:1`. Commit.

### Task 4: Permissões e sessão (TDD no domínio)

**Files:**
- Create: `lib/dominio/permissoes.ts`, Test: `lib/dominio/permissoes.test.ts`
- Create: `lib/auth.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`

**Interfaces (Produces):**
```ts
// lib/dominio/permissoes.ts  (puro, testável)
export const PERMISSOES: readonly { chave: string; rotulo: string; grupo: string }[]
export type Permissao = (typeof PERMISSOES)[number]['chave']
temPermissao(perfil: {todasPermissoes: boolean; permissoes: Set<string>}, p: Permissao): boolean
// lib/auth.ts (server-only)
getPerfil(): Promise<PerfilSessao | null>   // sessão supabase -> perfis + grupo + Set permissões; null se sem sessão/inativo
exigirPerfil(): Promise<PerfilSessao>       // redirect('/login') se null
exigirPermissao(p: Permissao): Promise<PerfilSessao> // redirect('/painel?negado=1') se não tem
```

- [ ] Testes de `temPermissao` (todasPermissoes ignora set; chave presente/ausente). Falhar → implementar → passar.
- [ ] `lib/supabase/server.ts`: `createServerClient` com adapter de cookies do Next (async `cookies()`); `lib/supabase/admin.ts`: `createClient` com service role (auth admin + storage).
- [ ] `lib/auth.ts` com cache por request (`React.cache`). Commit.

### Task 5: Auditoria

**Files:**
- Create: `lib/audit.ts`

**Interfaces (Produces):**
```ts
registrarAuditoria(a: { ator: PerfilSessao | 'sistema'; acao: string;
  entidade: 'cliente'|'contrato'|'fatura'|'pagamento'|'licenca'|'grupo'|'usuario'|'plataforma'|'anexo';
  entidadeId?: string; detalhes?: Record<string, unknown> }): Promise<void>
```
- [ ] Insert simples com nome do ator denormalizado; nunca lança (try/catch com console.error) para auditoria não derrubar a operação. Commit.

### Task 6: Middleware, login e logout

**Files:**
- Create: `middleware.ts`, `app/login/page.tsx`, `app/login/actions.ts`

- [ ] `middleware.ts`: matcher `['/painel/:path*']`; refresh de sessão via `@supabase/ssr`; sem user → redirect `/login`. Landing continua estática (matcher não a toca).
- [ ] `/login`: form email+senha (dark, card centralizado, logo RVLand), Server Action `entrar` → `signInWithPassword`; erro genérico "credenciais inválidas"; sucesso → redirect `/painel`. Action `sair` (em actions.ts) → `signOut` + redirect `/login`. Metadata noindex.
- [ ] Build passa; rota `/` permanece `○ (Static)`. Commit.

### Task 7: Layout do painel + navegação por permissão

**Files:**
- Create: `app/painel/layout.tsx`, `components/painel/sidebar.tsx`, `components/painel/page-header.tsx`, `components/ui/{label,select,table}.tsx` (mínimos, estilo shadcn)

- [ ] Layout server: `exigirPerfil()`; carrega configurações; banner fixo se `modo_panico` ("BLOQUEIOS SUSPENSOS") ou `modo_simulacao` ("Modo simulação — nenhum bloqueio real"); sidebar com itens filtrados por permissão (Dashboard, Clientes, Financeiro, Config, Auditoria); rodapé do usuário com grupo + botão sair. Metadata noindex.
- [ ] `app/painel/page.tsx` placeholder ("dashboard na Task 15"). Commit.

### Task 8: Seed

**Files:**
- Create: `scripts/seed.ts`

- [ ] Idempotente (upsert): grupos Dono (`todasPermissoes`), Financeiro (`clientes.ver, contratos.*, financeiro.*, licencas.ver, plataforma.auditoria`), Operação (`clientes.ver, licencas.*, plataforma.auditoria` — sem financeiro/contratos); configurações `modo_panico {ativo:false}`, `modo_simulacao {ativo:true}`, `max_dias_confianca {dias:7}`.
- [ ] Com `SEED_ADMIN_EMAIL`/`SEED_ADMIN_SENHA` no env: cria usuário via admin API (email confirmado) + perfil no grupo Dono.
- [ ] Documentar setup no README (criar projeto Supabase, envs, `db:migrate`, `db:seed`). Commit + verificação da fase (lint/test/build).

---

## FASE 1 — Clientes, contratos e financeiro

### Task 9: Domínio — preço vigente (TDD)

**Files:** Create: `lib/dominio/preco.ts`, Test: `lib/dominio/preco.test.ts`

**Interfaces (Produces):**
```ts
precoVigente(vigencias: {valorCentavos: number; vigenteDesde: string}[], competencia: string): number | null
```
- [ ] Testes: uma vigência antiga → vale; duas → pega a maior `vigenteDesde <= competencia`; nenhuma aplicável → null; empate impossível por UNIQUE lógico. Implementar.

### Task 10: Domínio — status de licença (TDD)

**Files:** Create: `lib/dominio/licenca.ts`, Test: `lib/dominio/licenca.test.ts`

**Interfaces (Produces):**
```ts
type EntradaLicenca = {
  hoje: string;
  contratosRecorrentesAtivos: number;    // conta contratos 'recorrente' status 'ativo'
  tinhaContratoRecorrente: boolean;      // já teve algum (p/ Cancelado)
  faturasAbertas: { vencimento: string; toleranciaDias: number; historica: boolean; status: string }[];
  diasConfianca: number;
  bloqueioManual: boolean;
  modoPanico: boolean;
}
type StatusLicenca = 'em_dia'|'atrasado'|'bloqueado'|'cancelado'|'sem_licenca'
statusLicenca(e: EntradaLicenca): { status: StatusLicenca; venceEm: string | null; toleradoAte: string | null }
```
- [ ] Testes cobrindo as 7 regras da seção 6 do spec + fatura histórica ignorada + cliente só com contrato fechado → `sem_licenca` + pânico não anula bloqueio manual. Implementar.

### Task 11: Domínio — decisão de geração de fatura (TDD)

**Files:** Create: `lib/dominio/faturas.ts`, Test: `lib/dominio/faturas.test.ts`

**Interfaces (Produces):**
```ts
deveGerarFatura(c: { tipo: string; status: string; inicio: string; diaVencimento: number | null },
  competencia: string, jaExiste: boolean): boolean
montarFatura(c: {...}, competencia: string, valorCentavos: number):
  { competencia: string; vencimento: string; valorCentavos: number }
```
- [ ] Testes: encerrado/fechado/começou depois/já existe → não gera; vencimento = dia do contrato na competência. Implementar. Commit (Tasks 9–11 juntas: "domínio da Fase 1").

### Task 12: Clientes — CRUD + licença (ações deliberadas)

**Files:**
- Create: `app/painel/clientes/page.tsx`, `app/painel/clientes/novo/page.tsx`, `app/painel/clientes/[id]/editar/page.tsx`, `app/painel/clientes/actions.ts`, `components/painel/status-badge.tsx`, `components/painel/form-cliente.tsx`
- Create: `lib/consultas/licencas.ts` (montagem de `EntradaLicenca` por cliente a partir do banco + configurações)

**Interfaces (Produces):**
```ts
// actions.ts ("use server", todas com exigirPermissao + Zod + auditoria)
criarCliente / atualizarCliente / arquivarCliente
concederConfianca(clienteId, dias)   // teto max_dias_confianca p/ não-dono
bloquearManual(clienteId, motivo) / desbloquearManual(clienteId)
// lib/consultas/licencas.ts
statusDeClientes(clienteIds: string[]): Promise<Map<string, ResultadoLicenca>>
```
- [ ] Lista com busca por nome/documento, filtro por status derivado, badge semáforo (em dia=verde `rgba(0,255,138)`, atrasado=âmbar, bloqueado=vermelho, cancelado=cinza, sem licença=neutro).
- [ ] Forms com `useActionState` + erros de campo Zod. Commit.

### Task 13: Contratos + vigências de preço

**Files:**
- Create: `app/painel/contratos/novo/page.tsx` (`?cliente=id`), `app/painel/contratos/[id]/page.tsx`, `app/painel/contratos/actions.ts`, `components/painel/form-contrato.tsx`

- [ ] Criar contrato: tipo, título, modelo_cobranca (fixo agora; por_uso desabilitado com nota "Credit fase futura"), valor inicial (vira vigência na competência do início), dia_vencimento (1–28, obrigatório se recorrente), piso, tolerância (default 4), início.
- [ ] Detalhe: dados + tabela de vigências + form "nova vigência" (valor + competência futura via select próximos 12 meses; `financeiro.alterar_preco`) + encerrar com confirmação (`contratos.encerrar`; seta fim=hoje) → licença do cliente vira Cancelado se era o único recorrente.
- [ ] Actions auditadas. Commit.

### Task 14: Faturas + pagamentos + cron

**Files:**
- Create: `app/api/cron/faturas/route.ts`, `app/painel/financeiro/page.tsx`, `app/painel/financeiro/faturas/nova/page.tsx`, `app/painel/financeiro/faturas/[id]/page.tsx`, `app/painel/financeiro/actions.ts`, `lib/servicos/gerar-faturas.ts`

**Interfaces (Produces):**
```ts
gerarFaturasDaCompetencia(competencia: string): Promise<{criadas: number; puladas: number}> // usado pelo cron e testável
// actions: criarFaturaManual (com flag historica + "já quitada" opcional que cria pagamento junto)
// lancarPagamento(faturaId, valor, dataISO, forma?, notas?) -> se soma >= valor: quitada + quitada_em
//   + auditoria 'pagamento.confirmado'; se cliente ficou sem vencidas: zera dias_confianca + 'licenca.renovada'
// editarFatura(vencimento/valor, só aberta) / cancelarFatura(motivo)
```
- [ ] Cron: `Authorization: Bearer CRON_SECRET`; gera para competência atual; responde `{criadas, puladas}`.
- [ ] `/painel/financeiro`: filtros competência (select) e situação (aberta/vencida/quitada/cancelada/histórica), totais no topo, links pro detalhe. `financeiro.ver`.
- [ ] Detalhe da fatura: dados, pagamentos lançados, form lançar pagamento (`financeiro.lancar_pagamento`), editar/cancelar (`financeiro.editar_cobranca`). Commit.

### Task 15: Dashboard (pedido explícito do João — resumo geral)

**Files:** Modify: `app/painel/page.tsx`; Create: `lib/consultas/dashboard.ts`

- [ ] KPIs (com `financeiro.ver`): **Recebido no mês** (pagamentos do mês corrente), **Em atraso** (soma de abertas vencidas não-históricas), **MRR** (soma do preço vigente dos recorrentes ativos), **A vencer em 15 dias**.
- [ ] **Tabela-resumo de TODOS os clientes ativos**: nome (link pro 360), status da licença (semáforo), nº contratos ativos, valor mensal (Σ preço vigente; oculto sem `financeiro.ver`), em aberto (idem), próximo vencimento, último pagamento. Ordenada: bloqueados → atrasados → em dia.
- [ ] Sem `financeiro.ver` (operação): vê a tabela só com colunas de status/datas. Commit.

### Task 16: Visão 360 do cliente + anexos + timeline

**Files:**
- Create: `app/painel/clientes/[id]/page.tsx`, `app/painel/clientes/[id]/anexos-actions.ts`, `components/painel/card-licenca.tsx`

- [ ] Blocos: cadastro; **licença** (status grande, válida até, tolerada até, dias de confiança + ações concederConfianca/bloquear/desbloquear conforme permissão); contratos (`contratos.ver`); últimas 12 faturas com situação (`financeiro.ver`); anexos (upload FormData → Storage `contratos/<clienteId>/<uuid>-nome`, lista com URL assinada 60s, `contratos.ver` p/ ver, `contratos.editar` p/ subir); **timeline** = auditoria filtrada do cliente (`plataforma.auditoria` não exigida aqui: timeline do cliente é operacional).
- [ ] Commit.

### Task 17: Config — plataforma, grupos, usuários

**Files:**
- Create: `app/painel/config/page.tsx`, `app/painel/config/actions.ts`, `app/painel/config/grupos/page.tsx`, `app/painel/config/grupos/[id]/page.tsx`, `app/painel/config/grupos/novo/page.tsx`, `app/painel/config/usuarios/page.tsx`, `app/painel/config/usuarios/novo/page.tsx`, `components/painel/form-grupo.tsx`

- [ ] Plataforma: toggles pânico (`plataforma.panico`) e simulação (`plataforma.simulacao`) com confirmação textual + teto de confiança; tudo auditado com valor antigo→novo.
- [ ] Grupos: lista, novo/editar com checkboxes do catálogo agrupado (`plataforma.grupos`); impedir excluir grupo com usuários.
- [ ] Usuários: lista com grupo/ativo; novo cria via admin API (email+senha provisória+grupo) (`plataforma.usuarios`); ativar/desativar; trocar grupo. Commit.

### Task 18: Auditoria (tela) + verificação final

**Files:** Create: `app/painel/auditoria/page.tsx`

- [ ] Lista paginada (50) com filtros por entidade e busca por texto na ação; exige `plataforma.auditoria`.
- [ ] Verificação da fase: `npm run lint && npm run test && npm run build`; conferir `/` estática; commit final.

## Self-review

Spec coverage: seções 4–9 do spec mapeadas nas tasks 1–18; pânico/simulação (Task 7 banner + 17 toggles + 10 na máquina); faturas históricas (Tasks 11/14); teto de confiança (Task 12); RLS (Task 3); noindex (Tasks 6/7); dashboard-resumo reforçado (Task 15). Fase 2 fora, conforme spec §11. Tipos: `EntradaLicenca`/`statusDeClientes`/`precoVigente` consistentes entre Tasks 10/12/15.
