# Plataforma RVLand — Design (Fases 0 e 1)

Data: 2026-08-16
Status: aprovado em conversa; implementação autorizada ("start confirmado")

## 1. Visão

O site da RVLand deixa de ser só landing page e passa a ser também a central
interna de gestão de clientes recorrentes: clientes, contratos, cobranças,
pagamentos, licenças e (Fase 2) controle do parque de servidores próprio via
agente em Go. Tudo hospedado na Vercel + Supabase, sem VPS.

A landing continua pública e estática. A plataforma vive em `/painel`,
sem link na landing, protegida por autenticação (a rota discreta é
discrição, não segurança — a segurança é o middleware). Páginas do painel
levam `noindex` e ficam fora do sitemap e do robots.txt (nunca colocar
`Disallow: /painel` — seria anunciar a rota).

## 2. Decisões fechadas (com o porquê)

| Decisão | Motivo |
|---|---|
| Acesso somente interno (dono + funcionários); cliente nunca entra | Definido pelo João. Portal do cliente não é meta. |
| Licença assinada É o lease do agente | Um documento assinado com "válida até / tolerada até / bloquear em" elimina a decisão fail-open vs fail-closed: o comportamento offline cai por gravidade. |
| Status Em dia/Atrasado são DERIVADOS de cobranças; Cancelado/Bloqueado são atos deliberados | Flag manual dessincroniza do financeiro. Derivado nunca mente. |
| Entidade "cobrança" (fatura) entre contrato e pagamento | Sem a cobrança esperada não existe "Atrasado" calculável. |
| Licenças sempre mensais; vencimento da fatura = vencimento da licença | Sem anual/trimestral. Dia de vencimento configurável por contrato (1–28). Credit = dia 15. |
| Tolerância padrão 4 dias, configurável por cliente/contrato | "Licença vencida, operando normalmente até X." Corte às 03:00 America/Sao_Paulo (Brasil sem DST desde 2019 → UTC-3 fixo). |
| Pagamento integral quita; parcial registra mas não renova | Cobrança guarda valor devido e valor pago. |
| Confirmou pagamento → licença renova e serviço sobe sozinho (via agente), tudo auditado | Painel distingue "licença renovada" de "renovação aplicada no servidor" (aplicação ocorre no heartbeat seguinte do agente). |
| Faturas históricas são inertes | João vai lançar meses passados só para registro. Nascem `historica=true`: entram no financeiro/relatórios, ficam fora da máquina de licenças e de avisos. |
| Contratos fechados: só registro financeiro, sem licenciamento | Cliente fechado paga integral e leva tudo; homologação é temporária e controlada pelo João. |
| Credit Recover: valor fixo por enquanto | Cobrança por uso (R$/cliente ativo) adiada até termos acesso ao back da Credit. Modelo de contrato já nasce com `modelo_cobranca` e piso configurável para não migrar dados depois. |
| Mudança de preço: vigência futura (a partir de qual competência), nunca retroativa | Tabela de vigências de preço por contrato. |
| Permissões SEMPRE por grupo, nunca por usuário; um grupo por usuário | Definido pelo João. Grupo "Dono" tem flag todas-as-permissões (à prova de permissões novas no futuro). |
| Operação não vê valores nem contratos | Telas escondem blocos financeiros sem `financeiro.ver`. |
| Dias de confiança com teto para quem não é dono | Teto configurável na plataforma. |
| Botão de pânico (suspende bloqueios) e modo simulação (mostra quem SERIA bloqueado) | Permissionados. Simulação nasce LIGADA — nenhum bloqueio real até o João desligar conscientemente. |
| Telemetria: estado atual sobrescrito por minuto + histórico curto podado por cron | Painel usa o estado atual; histórico 48h em minuto → agregado hora por 90d → descarte. Postgres aguenta (5–10 servidores). |
| Histórico SSH pode ser coletado sem cláusula contratual | Servidores ficam no datacenter do João; clientes só acessam o front. Infra própria. |
| Agente em Go, monorepo em `/agent`, binários no Supabase Storage | Contrato plataforma↔agente muda em commit atômico. Chave de assinatura (Ed25519) NUNCA na Vercel/CI — assina local. |
| Agente: verbos fechados (`status`, `start`, `stop`, `update`) + serviço alvo; nunca shell | Evita canal de C2 na infra. Capacidade nova = versão nova do agente. |
| Agente: endereço da plataforma em `/etc/rvland/agent.conf` (lista, tenta em ordem), não hardcoded | Canal de update não pode ser o mecanismo de migração do próprio endereço. Comprar domínio antes de escrever o agente. |
| Auto-update assinado, atômico, com canary por servidor e rollback | Update é a maior superfície de risco: verificar assinatura antes de trocar binário; versão fixada por servidor. |
| CLI do agente: `agenterv status|reconnect|version|enroll --token|logs` | Diagnóstico via SSH quando o painel mostrar agente silencioso. |
| Enrollment: cadastra servidor no painel → comando de uma linha com token de uso único → agente troca por credencial permanente | Fluxo aprovado. |
| Email automático via Resend (não Gmail SMTP) — Fase 3, após domínio | Gmail free = teto baixo + spam. |
| Backends dos clientes: Spring Boot + systemd | Agente fala `systemctl` (unidade por serviço cadastrado). |
| Front do cliente consulta licença via BACK dele (nunca do navegador) | Endpoint público de licença na RV; back do cliente consulta com cache curto e falha silenciosa. |
| Escala alvo: 5–10 servidores, começando só com a Credit | Projetar simples; sem preocupação de escala. |

## 3. Fases

- **Fase 0 — Fundação**: auth (Supabase), perfis, grupos e permissões, auditoria,
  middleware, layout do painel, schema base, seed. Auditoria entra aqui porque
  retrofitar auditoria é sempre pior.
- **Fase 1 — Núcleo do negócio**: clientes, contratos (recorrente/fechado),
  vigências de preço, geração de cobranças por cron, pagamentos, status derivado,
  anexos de contrato, dashboard, pânico/simulação, faturas históricas.
  Ao final, o negócio opera pelo sistema sem agente nenhum.
- **Fase 2 — Agente e parque** (design detalhado depois): inventário de servidores
  e serviços, enrollment, heartbeat + licença assinada (Ed25519), start/stop,
  telemetria, eventos/alertas, releases do agente, janela de manutenção,
  registro de versão em produção, aviso de SSL vencendo.
- **Fase 3 — Operação**: leads da landing no funil, chamados com horas,
  avisos por email (Resend), relatórios, medição por uso da Credit.

## 4. Arquitetura (Fases 0–1)

- **Next.js App Router na Vercel.** Landing intocada em `app/page.tsx`
  (estática). Painel em `app/painel/*` (dinâmico), login em `/login`.
  `middleware.ts` exige sessão em `/painel/*`.
- **Supabase**: Postgres (acesso server-side via Drizzle + postgres-js,
  `DATABASE_URL`), Auth (email+senha via `@supabase/ssr`, cookies), Storage
  (bucket privado `contratos`, download por URL assinada). RLS habilitado em
  todas as tabelas SEM policies → API REST anônima do Supabase nega tudo;
  o app acessa pela conexão direta (bypassa RLS).
- **Escrita** via Server Actions com Zod; **leitura** em Server Components.
- **Cron** (Vercel Cron, protegido por `CRON_SECRET`): diário, gera faturas da
  competência corrente (idempotente) e poda histórico de telemetria (Fase 2).
- **Dinheiro em centavos (int). Datas de negócio como DATE; competência = dia 1º do mês.**
- **Fuso**: helpers com America/Sao_Paulo fixo UTC-3.

## 5. Modelo de dados (Fase 0 + 1)

```
perfis           id uuid PK (= auth.users.id), nome, email, grupo_id FK, ativo bool
grupos           id, nome, descricao, todas_permissoes bool
grupos_permissoes grupo_id FK, permissao text  PK(grupo_id, permissao)
auditoria        id, ator_id, ator_nome (denorm.), acao, entidade, entidade_id, detalhes jsonb, criado_em
configuracoes    chave text PK, valor jsonb
                 -- modo_panico {ativo}, modo_simulacao {ativo}, max_dias_confianca {dias}

clientes         id, nome, razao_social, documento, email, telefone, notas,
                 status ('ativo'|'arquivado'), criado_em, atualizado_em
contratos        id, cliente_id FK, tipo ('recorrente'|'fechado'), titulo, descricao,
                 modelo_cobranca ('fixo'|'por_uso'), dia_vencimento int 1–28 (recorrente),
                 valor_minimo_centavos (piso, por_uso), tolerancia_dias int default 4,
                 status ('ativo'|'encerrado'), inicio date, fim date?, criado_em
contratos_precos id, contrato_id FK, valor_centavos, vigente_desde date (competência),
                 criado_por, criado_em   -- nunca editar/apagar vigência passada
faturas          id, contrato_id FK, cliente_id (denorm.), competencia date,
                 vencimento date, valor_centavos, pago_centavos default 0,
                 status ('aberta'|'quitada'|'cancelada'), historica bool default false,
                 quitada_em?, criado_em   UNIQUE(contrato_id, competencia) p/ geradas
pagamentos       id, fatura_id FK, valor_centavos, pago_em date, forma, notas,
                 criado_por, criado_em
licencas         cliente_id PK, dias_confianca int default 0,
                 bloqueio_manual bool default false, bloqueio_motivo, atualizado_em
                 -- linha criada sob demanda; ausência = defaults
anexos           id, cliente_id FK, contrato_id FK?, nome_arquivo, caminho_storage,
                 tamanho, enviado_por, criado_em
```

## 6. Máquina de estados da licença (derivada, por cliente)

Entrada: faturas abertas não-históricas dos contratos recorrentes ativos do
cliente + linha `licencas` + configurações globais.

1. Contrato recorrente encerrado (e nenhum outro ativo) → **Cancelado**
2. `bloqueio_manual` → **Bloqueado** (motivo registrado)
3. Sem fatura aberta vencida → **Em dia**
4. Fatura vencida, hoje ≤ vencimento + tolerância do contrato + dias_confiança → **Atrasado**
5. Além disso → **Bloqueado** (na Fase 1 é o estado exibido/pretendido;
   execução real chega com o agente na Fase 2)
6. `modo_panico` ativo → nunca resulta Bloqueado por atraso (mostra Atrasado +
   banner "bloqueios suspensos"); bloqueio manual continua valendo
7. `modo_simulacao` ativo → Bloqueado por atraso é exibido como "seria bloqueado"

Pagamento integral confirmado → cliente sem vencidas → Em dia na hora
(derivado); `dias_confianca` zera; auditoria registra `pagamento.confirmado`
e `licenca.renovada`. Datas exibidas: "válida até" = vencimento da próxima
fatura aberta (ou próxima a gerar); "tolerada até" = vencimento + tolerância
+ confiança.

## 7. Geração de faturas (cron diário, idempotente)

Para cada contrato `recorrente` ativo com `modelo_cobranca` atual:
- competência = mês corrente (SP). Se contrato iniciou depois da competência
  ou está encerrado → pula.
- Se não existe fatura (contrato, competência) → cria: vencimento =
  (ano, mês, dia_vencimento), valor = vigência de preço com maior
  `vigente_desde` ≤ competência, `historica=false`, `aberta`.
- Faturas manuais (históricas, avulsas, parcelas de contrato fechado) são
  criadas por formulário; histórica nunca dispara licença/aviso.

## 8. Permissões (catálogo)

```
clientes.ver criar editar arquivar
contratos.ver criar editar encerrar
financeiro.ver lancar_pagamento editar_cobranca alterar_preco
licencas.ver renovar conceder_confianca bloquear desbloquear
servidores.ver cadastrar editar executar manutencao        (Fase 2)
agente.publicar forcar_update                              (Fase 2)
plataforma.panico simulacao usuarios grupos auditoria
```

`grupos.todas_permissoes=true` (Dono) concede tudo, inclusive permissões
futuras. Dias de confiança: quem não é "todas_permissoes" respeita o teto
`max_dias_confianca`. Seed cria grupos Dono (todas), Financeiro e Operação
(sem `financeiro.*` e sem `contratos.ver`).

## 9. Telas (Fase 1)

- `/login` — email+senha, rate limit do Supabase, noindex.
- `/painel` — dashboard: recebido no mês, total em atraso, MRR, próximos
  vencimentos (15d), semáforo de clientes. Valores só com `financeiro.ver`;
  semáforo (status) visível para operação.
- `/painel/clientes` — lista com busca e filtro por status derivado.
- `/painel/clientes/novo`, `/painel/clientes/[id]/editar`
- `/painel/clientes/[id]` — **visão 360**: cadastro, licença (status, datas,
  ações: confiança/bloquear/desbloquear), contratos (se permitido), faturas
  recentes (se permitido), anexos, timeline (auditoria do cliente).
- `/painel/contratos/novo?cliente=…`, `/painel/contratos/[id]` — detalhe,
  vigências de preço (nova vigência a partir de competência futura), encerrar.
- `/painel/financeiro` — faturas por competência/situação + totais;
  `/painel/financeiro/faturas/nova` (inclui modo histórica e contrato fechado);
  `/painel/financeiro/faturas/[id]` — detalhe, lançar pagamento, editar/cancelar.
- `/painel/config` — pânico, simulação, teto de confiança (permissionados).
- `/painel/config/grupos`, `/painel/config/usuarios` — CRUD de grupos com
  checkboxes de permissões; criação de usuário (admin API) com grupo.
- `/painel/auditoria` — trilha com filtros.

## 10. Tratamento de erros e testes

- Zod em toda entrada de Server Action; erros de campo voltam via
  `useActionState`; ações verificam permissão no servidor SEMPRE
  (UI esconder botão não é segurança).
- Domínio puro (status de licença, resolução de preço por competência,
  decisão de geração de fatura, competência/fuso, permissões) em
  `lib/dominio/` com testes vitest (TDD).
- Build + typecheck cobrem páginas; integração com banco real fica para
  quando houver Supabase provisionado (setup documentado).

## 11. Fora de escopo agora (anotado para não perder)

Fase 2: protocolo completo do agente (heartbeat, licença Ed25519, telemetria,
eventos, releases canary, `agenterv`), endpoint público de licença para o back
dos clientes, comando de instalação com token. Fase 3: Resend, leads, chamados,
medição por uso da Credit (validação de "desativou no fim do mês pra pagar
menos" cruzando movimento × status — a discutir com acesso ao back da Credit).
Extras aceitos: registro de versão em produção, janela de manutenção, alerta
de SSL.
