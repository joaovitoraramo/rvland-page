# Bot do Telegram: avisos e comando /fatura — Design

Data: 2026-08-29
Status: desenho aprovado em conversa; aguarda revisão do spec

## 1. Objetivo

Levar a operação do dia a dia para o Telegram (@rvlandcontact_bot), sem abrir
o painel: aviso em tempo real de lead novo, aviso diário de virada de estado
de licença, e registro de pagamento pelo comando `/fatura`.

## 2. Decisões (com o porquê)

| Decisão | Motivo |
|---|---|
| **Webhook**, não polling | Vercel é serverless: não há processo vivo para fazer long-polling. O Telegram entrega cada update num POST. |
| **Um único chat autorizado** (`TELEGRAM_CHAT_ID`) | Só o João usa. Sem espelhar grupos/permissões do painel no Telegram. |
| Licenças: **só virada de estado**, 1×/dia | Evita spam diário repetindo a mesma pendência. Escolha do João. |
| Checagem de licença **pega carona no cron de faturas** | Vercel Hobby limita 2 crons por projeto — os dois já existem (faturas 03:00 SP, telemetria 03:30 SP). Rodar após a geração de faturas também garante estado fresco. |
| Último estado notificado em `configuracoes`, chave `telegram_licencas` | Mapa clienteId→status. Sem migração nova. |
| **id curto** = 8 primeiros caracteres do uuid | Digitável no celular. Aparece nos avisos; o comando resolve por prefixo. |
| Núcleo de pagamento extraído para `lib/servicos/registrar-pagamento.ts` | Painel e bot aplicam a MESMA regra (pagamento → quitação → renovação automática de licença → auditoria). Nada duplicado. |
| Falha do Telegram **nunca derruba o fluxo** | Mesmo padrão da auditoria: try/catch, log no servidor, vida que segue. |
| Mensagens em **texto puro** (sem parse_mode) | Dispensa escapar HTML/Markdown de dados vindos de formulário público. |

## 3. Componentes

- **`lib/telegram.ts`** (server-only): `enviarTelegram(texto: string): Promise<boolean>` —
  POST `sendMessage` na API do bot com `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`,
  timeout curto (5s), nunca lança. Sem env configurada → no-op silencioso
  (dev sem bot continua funcionando).
- **`lib/dominio/telegram.ts`** (puro, testado com vitest):
  - `parseComandoFatura(texto)` → `{ idCurto, valorCentavos, pagoEm }` ou
    `{ erro }`. Valor no formato `2490,40` (reutiliza `reaisParaCentavos`);
    data `DD/MM/AAAA` opcional → ISO; ausente = hoje (injetado).
  - `distribuirPagamento(faturasAbertas, valorCentavos)` → alocações por
    fatura (da mais antiga por vencimento) + sobra.
  - Formatadores de mensagem: lead novo, virada de licença, resposta do
    `/fatura` (recebem dados, devolvem string — testáveis).
- **`lib/servicos/registrar-pagamento.ts`**: núcleo extraído do
  `lancarPagamento` do painel — insere pagamento, atualiza `pagoCentavos`/
  quitação, renova licença quando cabe, audita. O `lancarPagamento` passa a
  chamá-lo; o webhook também.
- **`app/api/telegram/webhook/route.ts`** (POST):
  1. Confere header `X-Telegram-Bot-Api-Secret-Token` === `TELEGRAM_WEBHOOK_SECRET`; errado → 401.
  2. Update de chat ≠ `TELEGRAM_CHAT_ID` → 200 sem resposta (não vaza nada).
  3. `/fatura ...` → executa e responde no chat; `/start` e o resto → texto de ajuda com a sintaxe.
  4. Sempre 200 rápido (erro faria o Telegram reenviar o update).
- **Cron de faturas** (`app/api/cron/faturas/route.ts`) ganha uma etapa 2:
  `statusDeClientes` de todos os clientes ativos → compara com
  `telegram_licencas` → envia uma mensagem por virada → grava o mapa novo.
  Transições notificadas: `→ atrasado`, `→ seria_bloqueado`, `→ bloqueado`,
  `→ em_dia` (recuperação). `sem_licenca` não notifica.
- **`criarLead`**: após gravar o lead, `await enviarTelegram(...)` (com o
  try/catch interno) — em serverless o envio precisa completar antes do
  return.

## 4. Mensagens (formato)

- **Lead**: `🆕 Lead EN — Sparkle Car Wash · John | Canal: SMS 5551234567 | "mensagem..."` (origem, negócio se houver, nome, canal+contato, mensagem truncada em 300 chars).
- **Licença**: `⚠️ Credit Recover (id a1b2c3d4) ficou ATRASADO. Venceu 15/09/2026, tolera até 19/09/2026. Registrar pagamento: /fatura a1b2c3d4 2490,40` — recuperação usa ✅, bloqueio usa ⛔.
- **Resposta do /fatura**: o que quitou/ficou parcial por competência, sobra
  se houver, e o novo status da licença: `✅ Credit Recover: 09/2026 quitada (R$ 2.490,40). Licença: em dia — opera até 20/10/2026.`

## 5. Regras do /fatura

- Sintaxe: `/fatura <id8> <valor> [data]` — ex.: `/fatura a1b2c3d4 2490,40 29/08/2026`.
- Cliente por prefixo do uuid (`id::text LIKE 'a1b2c3d4%'`): 0 achados → erro
  claro; 2+ → pede mais caracteres (aceita prefixo de qualquer tamanho ≥ 8).
- Faturas elegíveis: `status = aberta` e `historica = false`, ordenadas por
  vencimento crescente. Nenhuma elegível → responde "nada em aberto" e não
  grava nada.
- Distribui o valor na ordem; a última alocação pode ficar parcial. Sobra
  além do total em aberto é informada e NÃO gravada.
- Data ausente → `hojeSP()`.
- `criadoPor: "telegram"`; auditoria com ator `"sistema"` e
  `detalhes: { via: "telegram" }` (além da auditoria normal do pagamento).

## 6. Segurança

- `TELEGRAM_WEBHOOK_SECRET`: 32 bytes aleatórios (base64url), gerado no setup.
- Token e secret só em env de servidor; nunca aparecem em log ou client.
- Chat não autorizado é ignorado com 200 (sem mensagem de erro).

## 7. Envs e setup

- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` em
  `.env.local` e na Vercel (Production) — via `vercel env add` com o CLI
  logado; fallback: dashboard.
- Registro: `setWebhook` com `url=https://rvland-page.vercel.app/api/telegram/webhook`,
  `secret_token`, `allowed_updates=["message"]`, `drop_pending_updates=true`.

## 8. Validação

- vitest: parser do comando (feliz, valor inválido, data inválida),
  distribuição (1 fatura, várias, parcial, sobra, nenhuma), formatadores.
- Harness `scripts/validar-telegram.mjs` contra o dev local: POST de updates
  simulados — secret errado (401), chat estranho (ignorado), `/fatura` com
  id inexistente/ambíguo, e o caminho feliz criando cliente+contrato+fatura
  descartáveis no banco, conferindo quitação e apagando tudo no fim.
- Cron: chamada local com `CRON_SECRET` e estado semeado em
  `telegram_licencas` para conferir detecção de virada.

## 9. Fora de escopo

Outros comandos (/status, /leads), múltiplos chats/usuários, botões inline,
avisos de servidores/telemetria, e formatação rica (parse_mode).
