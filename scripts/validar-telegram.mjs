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

// 2a. /clientes responde 200 (a listagem vai pro chat)
const listaClientes = await post(update("/clientes"));
if (listaClientes.status !== 200) falhas.push(`/clientes: esperado 200, veio ${listaClientes.status}`);

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
  select criado_por, pago_em::text as pago_em from pagamentos where fatura_id = ${fatura.id}`;
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

// 5. /leads e /lead com lead descartável (nota deve CONCATENAR)
const [ld] = await sql`
  insert into leads (origem, nome, negocio, canal, contato, mensagem, notas)
  values ('en', 'Harness Lead', 'Test Co', 'sms', '5550001111', 'Mensagem de teste.', 'Nota original.')
  returning id`;
const listaLeads = await post(update("/leads"));
if (listaLeads.status !== 200) falhas.push(`/leads: esperado 200, veio ${listaLeads.status}`);
const atualiza = await post(update(`/lead ${ld.id.slice(0, 8)} proposta Nota via telegram`));
if (atualiza.status !== 200) falhas.push(`/lead: esperado 200, veio ${atualiza.status}`);
await new Promise((r) => setTimeout(r, 1200));
const [ldDepois] = await sql`select status, notas from leads where id = ${ld.id}`;
if (ldDepois.status !== "proposta") falhas.push(`lead não mudou de status: ${ldDepois.status}`);
if (!ldDepois.notas?.includes("Nota original.") || !ldDepois.notas?.includes("Nota via telegram")) {
  falhas.push(`nota não concatenou: ${ldDepois.notas}`);
}
await sql`delete from leads where id = ${ld.id}`;

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
