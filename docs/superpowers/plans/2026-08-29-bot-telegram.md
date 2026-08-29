# Bot do Telegram — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisos de leads e de virada de licença no Telegram (@rvlandcontact_bot) e registro de pagamento pelo comando `/fatura`, sem abrir o painel.

**Architecture:** Webhook `/api/telegram/webhook` na Vercel (secret + chat único autorizado); aviso de lead disparado de dentro da `criarLead`; checagem de licença pega carona no cron de faturas comparando com o último estado notificado (`configuracoes.telegram_licencas`); o núcleo do `lancarPagamento` vira serviço compartilhado para painel e bot aplicarem a mesma regra.

**Tech Stack:** Next.js 16 route handlers, Drizzle + postgres-js, Zod já existente no domínio, vitest, API HTTP do Telegram (sem SDK).

**Spec:** `docs/superpowers/specs/2026-08-29-bot-telegram-design.md`

## Global Constraints

- Um único chat autorizado (`TELEGRAM_CHAT_ID`); updates de outros chats → 200 sem resposta.
- Webhook exige header `X-Telegram-Bot-Api-Secret-Token` === `TELEGRAM_WEBHOOK_SECRET`; errado → 401.
- Falha de envio ao Telegram NUNCA derruba o fluxo chamador (try/catch interno, log, retorno booleano).
- Mensagens em texto puro (sem parse_mode). Datas em `formatarDataBR`, valores em `formatarReais`.
- Licenças: notificar SÓ virada de estado — `→ atrasado`, `→ bloqueado`, e `→ em_dia` quando o anterior era atrasado/bloqueado. Primeira execução (mapa vazio) semeia sem notificar. `cancelado`/`sem_licenca` nunca notificam.
- `/fatura`: aplica nas faturas `aberta` e `historica=false`, da mais antiga (vencimento) para a mais nova; sobra é informada e não gravada; data ausente = `hojeSP()`; `criadoPor: "telegram"`, ator de auditoria `"sistema"` com `detalhes.via = "telegram"`.
- id curto = prefixo do uuid com ≥ 8 caracteres; ambíguo → pedir mais caracteres.
- Vercel Hobby: NÃO criar terceiro cron — a checagem entra no cron de faturas existente.
- SEGREDOS NUNCA no git: o token do bot e o secret vivem só em `.env.local` e na Vercel. O token real está com o João (já fornecido em conversa); este documento usa `<TOKEN_DO_BOT>`.
- Testes: `npm test` (vitest). Build: `npm run build`. Commits em português, branch `plataforma`.

---

### Task 1: Domínio do bot (parser, distribuição, mensagens)

**Files:**
- Create: `lib/dominio/telegram.ts`
- Test: `lib/dominio/telegram.test.ts`

**Interfaces:**
- Consumes: `reaisParaCentavos`, `formatarReais` de `@/lib/formato`; `formatarDataBR`, `formatarCompetenciaBR` de `@/lib/dominio/tempo`.
- Produces (de `@/lib/dominio/telegram`):
  - `type ComandoFatura = { idCurto: string; valorCentavos: number; pagoEm: string | null }`
  - `parseComandoFatura(texto: string): { ok: true; comando: ComandoFatura } | { ok: false; erro: string }`
  - `type FaturaEmAberto = { id: string; competencia: string; vencimento: string; valorCentavos: number; pagoCentavos: number }`
  - `type Alocacao = { faturaId: string; competencia: string; valorCentavos: number; quita: boolean }`
  - `distribuirPagamento(faturas: FaturaEmAberto[], valorCentavos: number): { alocacoes: Alocacao[]; sobraCentavos: number }`
  - `mensagemLead(lead: { origem: "br" | "en"; nome: string; negocio?: string | null; canal: string; contato: string; mensagem: string }): string`
  - `mensagemLicenca(aviso: { nome: string; idCurto: string; novo: "atrasado" | "bloqueado" | "em_dia"; venceEm: string | null; toleradoAte: string | null }): string`
  - `respostaFatura(r: { clienteNome: string; alocacoes: Alocacao[]; sobraCentavos: number; licenca: { status: string; venceEm: string | null; toleradoAte: string | null } }): string`
  - `AJUDA_BOT: string` (texto de ajuda com a sintaxe do comando)

- [ ] **Step 1: Escrever os testes** (`lib/dominio/telegram.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import {
  distribuirPagamento,
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
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `lib/dominio/telegram.ts`**

```ts
import { reaisParaCentavos, formatarReais } from "@/lib/formato";
import { formatarCompetenciaBR, formatarDataBR } from "@/lib/dominio/tempo";

/**
 * Domínio puro do bot do Telegram: parser do /fatura, distribuição de um
 * valor entre faturas em aberto e os textos das mensagens. Nada de IO aqui.
 */

export type ComandoFatura = { idCurto: string; valorCentavos: number; pagoEm: string | null };

const ID_RE = /^[0-9a-f][0-9a-f-]{7,35}$/;
const DATA_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export const AJUDA_BOT = [
  "Comandos disponíveis:",
  "/fatura <id> <valor> [data]",
  "Ex.: /fatura a1b2c3d4 2.490,40 29/08/2026",
  "O id do cliente aparece nos avisos de licença. Sem data = hoje.",
].join("\n");

export function parseComandoFatura(
  texto: string
): { ok: true; comando: ComandoFatura } | { ok: false; erro: string } {
  const partes = texto.trim().split(/\s+/);
  const [comando, id, valor, data, ...resto] = partes;

  if (!comando?.replace(/@\S+$/, "").match(/^\/fatura$/) || !id || !valor || resto.length > 0) {
    return { ok: false, erro: `Não entendi. ${AJUDA_BOT}` };
  }

  const idCurto = id.toLowerCase();
  if (!ID_RE.test(idCurto)) {
    return { ok: false, erro: "Id inválido — use pelo menos os 8 primeiros caracteres do id do cliente (aparece nos avisos de licença)." };
  }

  const valorCentavos = reaisParaCentavos(valor);
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) {
    return { ok: false, erro: "Valor inválido. Use o formato 2.490,40 (ou 2490,40)." };
  }

  let pagoEm: string | null = null;
  if (data) {
    const m = data.match(DATA_RE);
    if (!m) return { ok: false, erro: "Data inválida. Use DD/MM/AAAA, ex.: 29/08/2026." };
    const [, dd, mm, aaaa] = m;
    const dia = Number(dd);
    const mes = Number(mm);
    const diasNoMes = new Date(Number(aaaa), mes, 0).getDate();
    if (mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes) {
      return { ok: false, erro: "Data inválida. Use DD/MM/AAAA, ex.: 29/08/2026." };
    }
    pagoEm = `${aaaa}-${mm}-${dd}`;
  }

  return { ok: true, comando: { idCurto, valorCentavos, pagoEm } };
}

export type FaturaEmAberto = {
  id: string;
  competencia: string;
  vencimento: string;
  valorCentavos: number;
  pagoCentavos: number;
};

export type Alocacao = {
  faturaId: string;
  competencia: string;
  valorCentavos: number;
  quita: boolean;
};

/** Distribui o valor da mais antiga (vencimento) para a mais nova. */
export function distribuirPagamento(
  faturas: FaturaEmAberto[],
  valorCentavos: number
): { alocacoes: Alocacao[]; sobraCentavos: number } {
  const ordenadas = [...faturas].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const alocacoes: Alocacao[] = [];
  let restante = valorCentavos;

  for (const f of ordenadas) {
    if (restante <= 0) break;
    const falta = f.valorCentavos - f.pagoCentavos;
    if (falta <= 0) continue;
    const aloca = Math.min(falta, restante);
    alocacoes.push({
      faturaId: f.id,
      competencia: f.competencia,
      valorCentavos: aloca,
      quita: aloca === falta,
    });
    restante -= aloca;
  }

  return { alocacoes, sobraCentavos: restante };
}

export function mensagemLead(lead: {
  origem: "br" | "en";
  nome: string;
  negocio?: string | null;
  canal: string;
  contato: string;
  mensagem: string;
}): string {
  const origem = lead.origem === "en" ? "EN" : "BR";
  const titulo = lead.negocio
    ? `🆕 Lead ${origem} — ${lead.negocio}`
    : `🆕 Lead ${origem}`;
  const corpo =
    lead.mensagem.length > 300 ? `${lead.mensagem.slice(0, 300)}…` : lead.mensagem;
  return [titulo, `${lead.nome} · ${lead.canal}: ${lead.contato}`, `«${corpo}»`].join("\n");
}

const ROTULO_STATUS: Record<string, string> = {
  em_dia: "em dia",
  atrasado: "atrasado",
  bloqueado: "bloqueado",
  cancelado: "cancelado",
  sem_licenca: "sem licença",
};

export function mensagemLicenca(aviso: {
  nome: string;
  idCurto: string;
  novo: "atrasado" | "bloqueado" | "em_dia";
  venceEm: string | null;
  toleradoAte: string | null;
}): string {
  const linhas: string[] = [];

  if (aviso.novo === "atrasado") {
    linhas.push(`⚠️ ${aviso.nome} (id ${aviso.idCurto}) ficou ATRASADO.`);
    if (aviso.venceEm) linhas.push(`Venceu em ${formatarDataBR(aviso.venceEm)}.`);
    if (aviso.toleradoAte) linhas.push(`Tolera até ${formatarDataBR(aviso.toleradoAte)}.`);
    linhas.push(`Registrar pagamento: /fatura ${aviso.idCurto} <valor>`);
  } else if (aviso.novo === "bloqueado") {
    linhas.push(`⛔ ${aviso.nome} (id ${aviso.idCurto}) foi BLOQUEADO.`);
    if (aviso.toleradoAte) linhas.push(`Tolerância venceu em ${formatarDataBR(aviso.toleradoAte)}.`);
    linhas.push(`Registrar pagamento: /fatura ${aviso.idCurto} <valor>`);
  } else {
    linhas.push(`✅ ${aviso.nome} (id ${aviso.idCurto}) voltou a ficar EM DIA.`);
    if (aviso.venceEm) linhas.push(`Próximo vencimento: ${formatarDataBR(aviso.venceEm)}.`);
  }

  return linhas.join("\n");
}

export function respostaFatura(r: {
  clienteNome: string;
  alocacoes: Alocacao[];
  sobraCentavos: number;
  licenca: { status: string; venceEm: string | null; toleradoAte: string | null };
}): string {
  const linhas = [`${r.clienteNome}:`];

  for (const a of r.alocacoes) {
    linhas.push(
      `${a.quita ? "✅" : "▫️"} ${formatarCompetenciaBR(a.competencia)}: ${formatarReais(
        a.valorCentavos
      )} ${a.quita ? "(quitada)" : "(parcial — fatura segue aberta)"}`
    );
  }

  if (r.sobraCentavos > 0) {
    linhas.push(`↩️ Sobra não registrada: ${formatarReais(r.sobraCentavos)}.`);
  }

  const rotulo = ROTULO_STATUS[r.licenca.status] ?? r.licenca.status;
  let licenca = `Licença: ${rotulo}`;
  if (r.licenca.status === "em_dia" && r.licenca.venceEm) {
    licenca += ` — próximo vencimento ${formatarDataBR(r.licenca.venceEm)}`;
  } else if (r.licenca.toleradoAte) {
    licenca += ` — tolerado até ${formatarDataBR(r.licenca.toleradoAte)}`;
  }
  linhas.push(licenca);

  return linhas.join("\n");
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/telegram.ts lib/dominio/telegram.test.ts
git commit -m "Domínio: comando /fatura, distribuição de pagamento e mensagens do bot"
```

---

### Task 2: Cliente de envio + credenciais locais

**Files:**
- Create: `lib/telegram.ts`
- Modify: `.env.local` (fora do git)

**Interfaces:**
- Produces: `enviarTelegram(texto: string): Promise<boolean>` de `@/lib/telegram` — server-only; sem env configurada é no-op que devolve false; nunca lança.

- [ ] **Step 1: Criar `lib/telegram.ts`**

```ts
import "server-only";

/**
 * Envio de mensagem ao chat autorizado do bot. Nunca lança: aviso é
 * cortesia — a operação que avisa não pode morrer porque o Telegram falhou.
 * Sem envs configuradas (dev sem bot), vira no-op.
 */
export async function enviarTelegram(texto: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  try {
    const resposta = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resposta.ok) console.error("[telegram] sendMessage falhou:", resposta.status);
    return resposta.ok;
  } catch (err) {
    console.error("[telegram] falha ao enviar:", err);
    return false;
  }
}
```

- [ ] **Step 2: Credenciais no `.env.local`**

```bash
SECRET=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
cat >> .env.local <<EOF
TELEGRAM_BOT_TOKEN=<TOKEN_DO_BOT>
TELEGRAM_CHAT_ID=1
TELEGRAM_WEBHOOK_SECRET=$SECRET
EOF
```
`TELEGRAM_CHAT_ID=1` é placeholder até o João mandar o `/start` (Task 8 troca
pelo real via `getUpdates`). Se o chat_id real já estiver disponível, usar
direto e enviar uma mensagem de teste com `curl .../sendMessage`.

- [ ] **Step 3: Verificar** — `npm run build` exit 0.

- [ ] **Step 4: Commit**

```bash
git add lib/telegram.ts
git commit -m "Telegram: cliente de envio de mensagens"
```

---

### Task 3: Núcleo de pagamento extraído (painel e bot com a mesma regra)

**Files:**
- Create: `lib/servicos/registrar-pagamento.ts`
- Modify: `app/(app)/painel/financeiro/actions.ts` (função `lancarPagamento`, linhas ~134–235)

**Interfaces:**
- Consumes: `db, faturas, pagamentos, licencas` de `@/lib/db`; `registrarAuditoria`; `hojeSP`; `PerfilSessao` de `@/lib/auth`.
- Produces (de `@/lib/servicos/registrar-pagamento`):
  - `type EntradaPagamento = { faturaId: string; valorCentavos: number; pagoEm: string; forma?: string | null; notas?: string | null; criadoPor: string; ator: PerfilSessao | "sistema"; detalhesExtras?: Record<string, unknown> }`
  - `type ResultadoPagamento = { ok: true; quitou: boolean; historica: boolean; clienteId: string; licencaRenovada: boolean } | { ok: false; erro: string }`
  - `registrarPagamentoNaFatura(entrada: EntradaPagamento): Promise<ResultadoPagamento>`

- [ ] **Step 1: Criar `lib/servicos/registrar-pagamento.ts`**

O corpo é o núcleo ATUAL do `lancarPagamento` (sem permissão, validação de
form e revalidate — isso fica no chamador), movido sem mudança de regra:

```ts
import "server-only";
import { and, eq, ne } from "drizzle-orm";

import { db, faturas, licencas, pagamentos } from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
import { hojeSP } from "@/lib/dominio/tempo";
import type { PerfilSessao } from "@/lib/auth";

export type EntradaPagamento = {
  faturaId: string;
  valorCentavos: number;
  pagoEm: string; // AAAA-MM-DD
  forma?: string | null;
  notas?: string | null;
  criadoPor: string;
  ator: PerfilSessao | "sistema";
  detalhesExtras?: Record<string, unknown>;
};

export type ResultadoPagamento =
  | { ok: true; quitou: boolean; historica: boolean; clienteId: string; licencaRenovada: boolean }
  | { ok: false; erro: string };

/**
 * Núcleo compartilhado de pagamento (painel e bot do Telegram): insere o
 * pagamento, atualiza a fatura, audita e aplica a renovação automática de
 * licença quando o cliente fica sem vencidas. A regra vive SÓ aqui.
 */
export async function registrarPagamentoNaFatura(
  entrada: EntradaPagamento
): Promise<ResultadoPagamento> {
  const [fatura] = await db.select().from(faturas).where(eq(faturas.id, entrada.faturaId));
  if (!fatura) return { ok: false, erro: "Fatura não encontrada." };
  if (fatura.status === "cancelada") return { ok: false, erro: "Fatura cancelada não recebe pagamento." };
  if (fatura.status === "quitada") return { ok: false, erro: "Fatura já quitada." };

  await db.insert(pagamentos).values({
    faturaId: entrada.faturaId,
    valorCentavos: entrada.valorCentavos,
    pagoEm: entrada.pagoEm,
    forma: entrada.forma ?? null,
    notas: entrada.notas ?? null,
    criadoPor: entrada.criadoPor,
  });

  const totalPago = fatura.pagoCentavos + entrada.valorCentavos;
  const quitou = totalPago >= fatura.valorCentavos;

  await db
    .update(faturas)
    .set({
      pagoCentavos: totalPago,
      ...(quitou ? { status: "quitada" as const, quitadaEm: new Date() } : {}),
    })
    .where(eq(faturas.id, entrada.faturaId));

  await registrarAuditoria({
    ator: entrada.ator,
    acao: quitou ? "pagamento.confirmado" : "pagamento.parcial",
    entidade: "pagamento",
    entidadeId: entrada.faturaId,
    detalhes: {
      clienteId: fatura.clienteId,
      valorCentavos: entrada.valorCentavos,
      totalPago,
      valorFatura: fatura.valorCentavos,
      ...(entrada.detalhesExtras ?? {}),
    },
  });

  // Renovação automática: quitou e o cliente ficou sem vencidas não-históricas
  // → zera dias de confiança e audita. O status deriva sozinho; o agente
  // aplica no próximo heartbeat.
  let licencaRenovada = false;
  if (quitou && !fatura.historica) {
    const hoje = hojeSP();
    const abertasVencidas = (
      await db
        .select({ vencimento: faturas.vencimento, historica: faturas.historica })
        .from(faturas)
        .where(
          and(
            eq(faturas.clienteId, fatura.clienteId),
            eq(faturas.status, "aberta"),
            ne(faturas.id, entrada.faturaId)
          )
        )
    ).filter((f) => !f.historica && f.vencimento < hoje);

    if (abertasVencidas.length === 0) {
      await db
        .update(licencas)
        .set({ diasConfianca: 0, atualizadoEm: new Date() })
        .where(eq(licencas.clienteId, fatura.clienteId));

      await registrarAuditoria({
        ator: "sistema",
        acao: "licenca.renovada",
        entidade: "licenca",
        entidadeId: fatura.clienteId,
        detalhes: { faturaId: entrada.faturaId, motivo: "pagamento integral confirmado" },
      });
      licencaRenovada = true;
    }
  }

  return { ok: true, quitou, historica: fatura.historica, clienteId: fatura.clienteId, licencaRenovada };
}
```

- [ ] **Step 2: Refatorar `lancarPagamento` para usar o serviço**

Substituir o miolo (da busca da fatura até o bloco de renovação, inclusive)
por:

```ts
  const resultado = await registrarPagamentoNaFatura({
    faturaId,
    valorCentavos,
    pagoEm,
    forma,
    notas,
    criadoPor: perfil.nome,
    ator: perfil,
  });
  if (!resultado.ok) return { erro: resultado.erro };
```

E ajustar o final para usar `resultado` (revalidates e mensagens idênticos):

```ts
  revalidatePath(`/painel/financeiro/faturas/${faturaId}`);
  revalidatePath(`/painel/clientes/${resultado.clienteId}`);
  revalidatePath("/painel/financeiro");
  revalidatePath("/painel");

  return {
    ok: resultado.quitou
      ? resultado.historica
        ? "Fatura histórica quitada (sem efeito em licença)."
        : "Fatura quitada — licença renovada."
      : "Pagamento parcial registrado; fatura segue aberta.",
  };
```
Imports que sobram no actions.ts (`licencas`, `pagamentos`, `ne`, `hojeSP`)
só são removidos se nenhuma OUTRA função do arquivo os usar — conferir com o
lint do build.

- [ ] **Step 3: Verificar** — `npm test` (nada quebrou) e `npm run build` exit 0.

- [ ] **Step 4: Commit**

```bash
git add lib/servicos/registrar-pagamento.ts "app/(app)/painel/financeiro/actions.ts"
git commit -m "Financeiro: núcleo de pagamento extraído para serviço compartilhado"
```

---

### Task 4: Execução do comando /fatura

**Files:**
- Create: `lib/servicos/fatura-telegram.ts`

**Interfaces:**
- Consumes: `parseComandoFatura`, `distribuirPagamento`, `respostaFatura` (Task 1); `registrarPagamentoNaFatura` (Task 3); `statusDeCliente` de `@/lib/consultas/licencas`; `hojeSP`.
- Produces: `executarComandoFatura(texto: string): Promise<string>` — SEMPRE devolve o texto de resposta para o chat (sucesso ou erro).

- [ ] **Step 1: Criar `lib/servicos/fatura-telegram.ts`**

```ts
import "server-only";
import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";

import { db, clientes, faturas } from "@/lib/db";
import { statusDeCliente } from "@/lib/consultas/licencas";
import { registrarPagamentoNaFatura } from "@/lib/servicos/registrar-pagamento";
import { hojeSP } from "@/lib/dominio/tempo";
import {
  distribuirPagamento,
  parseComandoFatura,
  respostaFatura,
} from "@/lib/dominio/telegram";

/** Executa /fatura vindo do webhook e devolve o texto de resposta. */
export async function executarComandoFatura(texto: string): Promise<string> {
  const parse = parseComandoFatura(texto);
  if (!parse.ok) return parse.erro;
  const { idCurto, valorCentavos, pagoEm } = parse.comando;

  const candidatos = await db
    .select({ id: clientes.id, nome: clientes.nome })
    .from(clientes)
    .where(sql`${clientes.id}::text like ${idCurto + "%"}`)
    .limit(3);

  if (candidatos.length === 0) {
    return `Nenhum cliente encontrado com id ${idCurto}.`;
  }
  if (candidatos.length > 1) {
    return `Mais de um cliente começa com ${idCurto} — use mais caracteres do id.`;
  }
  const cliente = candidatos[0];

  const abertas = await db
    .select({
      id: faturas.id,
      competencia: faturas.competencia,
      vencimento: faturas.vencimento,
      valorCentavos: faturas.valorCentavos,
      pagoCentavos: faturas.pagoCentavos,
    })
    .from(faturas)
    .where(
      and(
        eq(faturas.clienteId, cliente.id),
        eq(faturas.status, "aberta"),
        eq(faturas.historica, false)
      )
    )
    .orderBy(asc(faturas.vencimento));

  const { alocacoes, sobraCentavos } = distribuirPagamento(abertas, valorCentavos);
  if (alocacoes.length === 0) {
    return `${cliente.nome} não tem faturas em aberto — nada foi registrado.`;
  }

  const dataPagamento = pagoEm ?? hojeSP();
  for (const alocacao of alocacoes) {
    const resultado = await registrarPagamentoNaFatura({
      faturaId: alocacao.faturaId,
      valorCentavos: alocacao.valorCentavos,
      pagoEm: dataPagamento,
      criadoPor: "telegram",
      ator: "sistema",
      detalhesExtras: { via: "telegram" },
    });
    if (!resultado.ok) {
      return `Erro ao registrar em ${alocacao.competencia}: ${resultado.erro}`;
    }
  }

  revalidatePath(`/painel/clientes/${cliente.id}`);
  revalidatePath("/painel/financeiro");
  revalidatePath("/painel");

  const licenca = await statusDeCliente(cliente.id);
  return respostaFatura({
    clienteNome: cliente.nome,
    alocacoes,
    sobraCentavos,
    licenca,
  });
}
```

- [ ] **Step 2: Verificar** — `npm run build` exit 0 (comportamento é coberto pelo harness da Task 7).

- [ ] **Step 3: Commit**

```bash
git add lib/servicos/fatura-telegram.ts
git commit -m "Telegram: execução do comando /fatura"
```

---

### Task 5: Webhook + aviso de lead em tempo real

**Files:**
- Create: `app/api/telegram/webhook/route.ts`
- Modify: `lib/acoes/criar-lead.ts` (aviso após gravar)

**Interfaces:**
- Consumes: `enviarTelegram` (Task 2); `executarComandoFatura` (Task 4); `AJUDA_BOT`, `mensagemLead` (Task 1); `rotuloCanal` de `@/lib/dominio/leads`.
- Produces: rota `POST /api/telegram/webhook`.

- [ ] **Step 1: Criar `app/api/telegram/webhook/route.ts`**

```ts
import { NextResponse } from "next/server";

import { enviarTelegram } from "@/lib/telegram";
import { executarComandoFatura } from "@/lib/servicos/fatura-telegram";
import { AJUDA_BOT } from "@/lib/dominio/telegram";

export const dynamic = "force-dynamic";

/**
 * Webhook do bot. Segurança em duas camadas: o secret que o próprio Telegram
 * ecoa num header a cada entrega, e o filtro do único chat autorizado —
 * updates de estranhos morrem com 200 silencioso (não vaza nada).
 */
export async function POST(request: Request) {
  const segredo = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!segredo || request.headers.get("x-telegram-bot-api-secret-token") !== segredo) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const update = await request.json().catch(() => null);
  const mensagem = update?.message;
  const chatId = String(mensagem?.chat?.id ?? "");
  const autorizado = process.env.TELEGRAM_CHAT_ID;

  if (!autorizado || chatId !== autorizado) {
    return NextResponse.json({ ok: true });
  }

  const texto = String(mensagem?.text ?? "").trim();
  if (texto.startsWith("/fatura")) {
    await enviarTelegram(await executarComandoFatura(texto));
  } else {
    await enviarTelegram(AJUDA_BOT);
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Aviso de lead na `criarLead`**

Em `lib/acoes/criar-lead.ts`, importar:

```ts
import { enviarTelegram } from "@/lib/telegram";
import { mensagemLead } from "@/lib/dominio/telegram";
import { rotuloCanal } from "@/lib/dominio/leads";
```

E, logo após o `registrarAuditoria` existente (antes do `return { ok: true }`):

```ts
  await enviarTelegram(
    mensagemLead({
      origem: lead.origem,
      nome: lead.nome,
      negocio: lead.negocio,
      canal: rotuloCanal[lead.canal],
      contato: lead.contato,
      mensagem: lead.mensagem,
    })
  );
```
(`await` é obrigatório: em serverless a função morre antes de um fetch solto
completar; o try/catch interno do `enviarTelegram` garante que falha não
afeta o lead.)

- [ ] **Step 3: Verificar** — `npm run build` exit 0; rota `ƒ /api/telegram/webhook` na tabela.

- [ ] **Step 4: Commit**

```bash
git add app/api/telegram/webhook/route.ts lib/acoes/criar-lead.ts
git commit -m "Telegram: webhook autorizado e aviso de lead em tempo real"
```

---

### Task 6: Aviso de virada de licença no cron diário

**Files:**
- Create: `lib/servicos/avisos-licenca.ts`
- Modify: `app/api/cron/faturas/route.ts`

**Interfaces:**
- Consumes: `statusDeClientes` de `@/lib/consultas/licencas`; `getConfig`? não — leitura direta de `configuracoes` via `setConfig`/select; `mensagemLicenca` (Task 1); `enviarTelegram` (Task 2).
- Produces: `avisarViradasDeLicenca(): Promise<{ enviados: number }>`.

- [ ] **Step 1: Criar `lib/servicos/avisos-licenca.ts`**

```ts
import "server-only";
import { eq } from "drizzle-orm";

import { db, clientes, configuracoes } from "@/lib/db";
import { setConfig } from "@/lib/config";
import { statusDeClientes } from "@/lib/consultas/licencas";
import { enviarTelegram } from "@/lib/telegram";
import { mensagemLicenca } from "@/lib/dominio/telegram";

const CHAVE = "telegram_licencas";
const NOTIFICAVEIS = new Set(["atrasado", "bloqueado"]);

/**
 * Compara o status de licença de cada cliente ativo com o último estado
 * notificado (configuracoes.telegram_licencas) e avisa só as viradas:
 * → atrasado, → bloqueado, e → em_dia quando vinha de atrasado/bloqueado.
 * Primeira execução (mapa vazio) semeia sem notificar — sem tempestade
 * de mensagens no deploy.
 */
export async function avisarViradasDeLicenca(): Promise<{ enviados: number }> {
  const ativos = await db
    .select({ id: clientes.id, nome: clientes.nome })
    .from(clientes)
    .where(eq(clientes.status, "ativo"));
  if (ativos.length === 0) return { enviados: 0 };

  const statusAtual = await statusDeClientes(ativos.map((c) => c.id));

  const [linha] = await db
    .select()
    .from(configuracoes)
    .where(eq(configuracoes.chave, CHAVE));
  const anterior = (linha?.valor ?? {}) as Record<string, string>;

  const novoMapa: Record<string, string> = {};
  let enviados = 0;

  for (const cliente of ativos) {
    const resultado = statusAtual.get(cliente.id);
    if (!resultado) continue;
    const novo = resultado.status;
    novoMapa[cliente.id] = novo;

    const antes = anterior[cliente.id];
    if (!antes || antes === novo) continue;

    const virouRuim = NOTIFICAVEIS.has(novo);
    const recuperou = novo === "em_dia" && NOTIFICAVEIS.has(antes);
    if (!virouRuim && !recuperou) continue;

    const ok = await enviarTelegram(
      mensagemLicenca({
        nome: cliente.nome,
        idCurto: cliente.id.slice(0, 8),
        novo: novo as "atrasado" | "bloqueado" | "em_dia",
        venceEm: resultado.venceEm,
        toleradoAte: resultado.toleradoAte,
      })
    );
    if (ok) enviados++;
  }

  await setConfig(CHAVE, novoMapa);
  return { enviados };
}
```

- [ ] **Step 2: Integrar no cron de faturas**

Em `app/api/cron/faturas/route.ts`, importar o serviço e trocar o final:

```ts
import { avisarViradasDeLicenca } from "@/lib/servicos/avisos-licenca";
```

```ts
  const competencia = competenciaAtual();
  const resultado = await gerarFaturasDaCompetencia(competencia);

  // Etapa 2: avisos de virada de licença no Telegram. Falha aqui não pode
  // derrubar a geração de faturas — o cron responde 200 do mesmo jeito.
  let avisosLicenca = 0;
  try {
    avisosLicenca = (await avisarViradasDeLicenca()).enviados;
  } catch (err) {
    console.error("[cron/faturas] avisos de licença falharam:", err);
  }

  return NextResponse.json({ competencia, ...resultado, avisosLicenca });
```

- [ ] **Step 3: Verificar** — `npm test` e `npm run build` exit 0.

- [ ] **Step 4: Commit**

```bash
git add lib/servicos/avisos-licenca.ts app/api/cron/faturas/route.ts
git commit -m "Licenças: aviso de virada de estado no Telegram via cron diário"
```

---

### Task 7: Harness de validação do webhook

**Files:**
- Create: `scripts/validar-telegram.mjs`

**Interfaces:**
- Consumes: dev server local em `:3000` com as envs TELEGRAM_* do `.env.local`; ids/segurança das Tasks 1–6. Se `TELEGRAM_CHAT_ID` for real, o João recebe as respostas de teste no Telegram (inofensivo); com placeholder, o envio falha silencioso e o teste segue válido no banco.

- [ ] **Step 1: Criar `scripts/validar-telegram.mjs`**

```js
/* Valida o webhook do Telegram contra o dev local: segurança (secret e chat),
   erros do /fatura e o caminho feliz com cliente/contrato/fatura descartáveis
   criados e removidos no banco. Sai com código 1 se algo falhar. */
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const falhas = [];

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const { default: postgres } = await import("postgres");
const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1 });

function update(texto, chatId = env.TELEGRAM_CHAT_ID) {
  return { message: { chat: { id: Number(chatId) }, text: texto } };
}

async function post(body, secret = env.TELEGRAM_WEBHOOK_SECRET) {
  return fetch(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

// 1. segurança
const semSecret = await post(update("/fatura x"), null);
if (semSecret.status !== 401) falhas.push(`sem secret: esperado 401, veio ${semSecret.status}`);
const secretErrado = await post(update("/fatura x"), "errado");
if (secretErrado.status !== 401) falhas.push(`secret errado: esperado 401, veio ${secretErrado.status}`);
const chatEstranho = await post(update("/fatura x", "999999"));
if (chatEstranho.status !== 200) falhas.push(`chat estranho: esperado 200, veio ${chatEstranho.status}`);

// 2. comando com id inexistente responde 200 (a resposta vai pro chat)
const inexistente = await post(update("/fatura deadbeef 1,00"));
if (inexistente.status !== 200) falhas.push(`id inexistente: esperado 200, veio ${inexistente.status}`);

// 3. caminho feliz com dados descartáveis
const [cliente] = await sql`
  insert into clientes (nome, status) values ('Teste Telegram Harness', 'ativo')
  returning id`;
const [contrato] = await sql`
  insert into contratos (cliente_id, tipo, titulo, dia_vencimento, inicio)
  values (${cliente.id}, 'recorrente', 'Contrato harness', 15, '2026-01-01')
  returning id`;
const [fatura] = await sql`
  insert into faturas (contrato_id, cliente_id, competencia, vencimento, valor_centavos)
  values (${contrato.id}, ${cliente.id}, '2026-08-01', '2026-08-15', 250000)
  returning id`;

const idCurto = cliente.id.slice(0, 8);
const feliz = await post(update(`/fatura ${idCurto} 2.500,00 29/08/2026`));
if (feliz.status !== 200) falhas.push(`caminho feliz: esperado 200, veio ${feliz.status}`);
await new Promise((r) => setTimeout(r, 1500));

const [depois] = await sql`select status, pago_centavos from faturas where id = ${fatura.id}`;
if (depois.status !== "quitada" || Number(depois.pago_centavos) !== 250000) {
  falhas.push(`fatura não quitou: status=${depois.status} pago=${depois.pago_centavos}`);
}
const [pg] = await sql`
  select criado_por, pago_em from pagamentos where fatura_id = ${fatura.id}`;
if (!pg || pg.criado_por !== "telegram") falhas.push("pagamento sem criadoPor=telegram");
if (pg && String(pg.pago_em).slice(0, 10) !== "2026-08-29") {
  falhas.push(`data do pagamento errada: ${pg.pago_em}`);
}

// 4. sem faturas em aberto → 200 e nada gravado
const nada = await post(update(`/fatura ${idCurto} 50,00`));
if (nada.status !== 200) falhas.push(`sem abertas: esperado 200, veio ${nada.status}`);
const pagamentosDepois = await sql`
  select count(*)::int as n from pagamentos where fatura_id = ${fatura.id}`;
if (pagamentosDepois[0].n !== 1) falhas.push("registrou pagamento sem fatura aberta");

// limpeza (ordem por FK)
await sql`delete from pagamentos where fatura_id = ${fatura.id}`;
await sql`delete from faturas where id = ${fatura.id}`;
await sql`delete from contratos where id = ${contrato.id}`;
await sql`delete from licencas where cliente_id = ${cliente.id}`;
await sql`delete from clientes where id = ${cliente.id}`;
await sql.end();

if (falhas.length > 0) {
  console.error("FALHAS:\n" + falhas.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
console.log("validação do telegram: OK");
```

- [ ] **Step 2: Rodar contra o dev local**

```bash
lsof -ti :3000 | xargs kill 2>/dev/null; sleep 1
(npm run dev >/dev/null 2>&1 &) ; sleep 8
node scripts/validar-telegram.mjs; RS=$?
lsof -ti :3000 | xargs kill 2>/dev/null; exit $RS
```
Esperado: `validação do telegram: OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/validar-telegram.mjs
git commit -m "Validação: harness do webhook do Telegram"
```

---

### Task 8: Produção — envs, deploy e registro do webhook

**Files:** nenhum commitado (operações de ambiente); `.env.local` atualizado com o chat_id real.

**Pré-requisito:** o João precisa ter mandado `/start` para o @rvlandcontact_bot — sem isso não há chat_id.

- [ ] **Step 1: Capturar o chat_id real e atualizar `.env.local`**

```bash
curl -s "https://api.telegram.org/bot<TOKEN_DO_BOT>/getUpdates"
# extrair "chat":{"id":<CHAT_ID>} e substituir o placeholder:
perl -pi -e 's/^TELEGRAM_CHAT_ID=.*/TELEGRAM_CHAT_ID=<CHAT_ID>/' .env.local
```
Enviar mensagem de confirmação via `sendMessage` para provar o pareamento.

- [ ] **Step 2: Linkar o projeto e cadastrar as envs na Vercel**

```bash
npx vercel link --yes
printf '%s' "<TOKEN_DO_BOT>" | npx vercel env add TELEGRAM_BOT_TOKEN production
printf '%s' "<CHAT_ID>" | npx vercel env add TELEGRAM_CHAT_ID production
printf '%s' "<SECRET_GERADO_NA_TASK_2>" | npx vercel env add TELEGRAM_WEBHOOK_SECRET production
npx vercel env ls | grep TELEGRAM   # conferir as três
```

- [ ] **Step 3: Merge e deploy**

```bash
git checkout main && git pull && git merge plataforma --no-edit
npm test && git push origin main && git checkout plataforma
```
Aguardar o deploy: `curl -s -o /dev/null -w "%{http_code}" -X GET https://rvland-page.vercel.app/api/telegram/webhook` até responder **405** (rota só aceita POST; 404 = deploy antigo).

- [ ] **Step 4: Registrar o webhook**

```bash
curl -s "https://api.telegram.org/bot<TOKEN_DO_BOT>/setWebhook" \
  -d url="https://rvland-page.vercel.app/api/telegram/webhook" \
  -d secret_token="<SECRET_GERADO_NA_TASK_2>" \
  -d allowed_updates='["message"]' \
  -d drop_pending_updates=true
curl -s "https://api.telegram.org/bot<TOKEN_DO_BOT>/getWebhookInfo"
```
Esperado: `"url"` correto e `pending_update_count: 0`.

- [ ] **Step 5: Smoke test em produção**

1. Simular um update do próprio chat via POST no webhook de produção
   (`/fatura deadbeef 1,00` com o secret e o chat_id reais) → resposta
   "Nenhum cliente encontrado..." deve chegar NO TELEGRAM do João.
2. Pedir ao João para mandar qualquer mensagem ao bot → deve receber a
   ajuda (`AJUDA_BOT`) — prova o caminho Telegram → Vercel completo.

- [ ] **Step 6: Memória**

Atualizar `plataforma-rvland-decisoes.md` com: bot no ar, envs, chave
`telegram_licencas`, serviço compartilhado de pagamento e o harness.
