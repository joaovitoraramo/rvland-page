/* Validação visual do painel: navega, loga, screenshota cada tela e testa
   a máscara de competência + autofill de vencimento. */
import { readFileSync } from "node:fs";

const RAIZ = process.cwd();
const { chromium } = await import("playwright");
const SAIDA = process.argv[2] ?? ".playwright-fotos";
const BASE = "http://localhost:3000";
await import("node:fs").then((fs) => fs.mkdirSync(SAIDA, { recursive: true }));

const env = Object.fromEntries(
  readFileSync(`${RAIZ}/.env.local`, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errosConsole = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errosConsole.push(msg.text());
});
page.on("pageerror", (err) => errosConsole.push(String(err)));

async function foto(nome, opts = {}) {
  await page.waitForTimeout(700); // deixa as animações de entrada terminarem
  await page.screenshot({ path: `${SAIDA}/${nome}.png`, fullPage: opts.fullPage ?? false });
  console.log(`foto: ${nome}`);
}

// 1. Login
await page.goto(`${BASE}/login`);
await foto("01-login");
await page.fill("#email", env.SEED_ADMIN_EMAIL);
await page.fill("#senha", env.SEED_ADMIN_SENHA);
await page.click("button[type=submit]");
await page.waitForURL("**/painel", { timeout: 30000 });

// 2. Dashboard
await foto("02-dashboard", { fullPage: true });

// 3. Clientes
await page.goto(`${BASE}/painel/clientes`);
await foto("03-clientes");

// 4. Cliente 360 (primeiro "Abrir" da tabela)
await page.click("table a:has-text('Abrir')");
await page.waitForURL("**/painel/clientes/**");
await foto("04-cliente-360", { fullPage: true });

// 5. Financeiro
await page.goto(`${BASE}/painel/financeiro`);
await foto("05-financeiro", { fullPage: true });

// 6. Detalhe de fatura (primeira aberta)
await page.click("table a:has-text('Abrir')");
await page.waitForURL("**/faturas/**");
await foto("06-fatura-detalhe", { fullPage: true });

// 7. Nova fatura — select custom, máscara, autofill e fluxo de foco
await page.goto(`${BASE}/painel/financeiro/faturas/nova`);
await page.click("#contratoId"); // abre o SelectRico
await foto("07a-select-aberto");
await page.locator("[role='option']").first().click();

// escolher contrato deve focar a competência
const focoCompetencia = await page.evaluate(
  () => document.activeElement?.id === "competencia"
);
console.log(`FOCO pos-contrato em competencia: ${focoCompetencia}`);

await page.keyboard.type("042026", { delay: 40 });
const competenciaVal = await page.inputValue("#competencia");
const vencimentoVal = await page.inputValue("#vencimento");
console.log(`MASCARA competencia="${competenciaVal}" vencimento_autofill="${vencimentoVal}"`);

// competência completa deve ter pulado o foco pro valor
const focoValor = await page.evaluate(
  () => document.activeElement?.getAttribute("name") === "valor"
);
console.log(`FOCO pos-competencia em valor: ${focoValor}`);

await page.keyboard.type("200000", { delay: 25 });
const valorVal = await page.inputValue("input[name=valor]");
console.log(`MASCARA valor="${valorVal}"`);
await foto("07-nova-fatura-autofill");

// 8. Novo cliente (máscaras de doc/telefone)
await page.goto(`${BASE}/painel/clientes/novo`);
await page.type("#documento", "12345678000190", { delay: 20 });
await page.type("#telefone", "41984891365", { delay: 20 });
console.log(
  `MASCARA doc="${await page.inputValue("#documento")}" tel="${await page.inputValue("#telefone")}"`
);
await foto("08-novo-cliente");

// 9. Contrato (via 360)
await page.goto(`${BASE}/painel/clientes`);
await page.click("table a:has-text('Abrir')");
await page.waitForURL("**/painel/clientes/**");
const linkContrato = page.locator("a[href^='/painel/contratos/']").first();
if (await linkContrato.count()) {
  await linkContrato.click();
  await page.waitForURL("**/painel/contratos/**");
  await foto("09-contrato", { fullPage: true });
}

// 10. Config + grupos + usuários + auditoria
await page.goto(`${BASE}/painel/config`);
await foto("10-config");
await page.goto(`${BASE}/painel/config/grupos`);
await foto("11-grupos");
await page.goto(`${BASE}/painel/config/usuarios`);
await foto("12-usuarios");
await page.goto(`${BASE}/painel/auditoria`);
await foto("13-auditoria");

// Métrica simples de navegação (sensação de lag)
const t0 = Date.now();
await page.goto(`${BASE}/painel`);
await page.waitForLoadState("networkidle");
console.log(`NAV dashboard networkidle: ${Date.now() - t0}ms`);

console.log(`ERROS DE CONSOLE: ${errosConsole.length}`);
errosConsole.slice(0, 10).forEach((e) => console.log("  -", e));

await browser.close();
