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

// formulário EN → lead (com interesse capturado: 6 months + CTA do pricing)
await page.goto(`${BASE}/en`);
await page.click("#pricing button:has-text('6 months')");
await page.click("#pricing a:has-text('Get your free concept')");
await page.waitForTimeout(400);
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
await page.fill("input#contato", "@rvland.validacao");
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

// interesse de plano gravado silenciosamente + limpeza dos leads de teste
const { default: postgres } = await import("postgres");
const sqlDb = postgres(env.DATABASE_URL, { prepare: false, max: 1 });
const [leadEn] = await sqlDb`select plano_interesse from leads where nome = ${`Playwright EN ${marca}`}`;
if (!leadEn || leadEn.plano_interesse !== "m6") {
  falhas.push(`plano_interesse esperado m6, veio ${leadEn?.plano_interesse}`);
}
await sqlDb`delete from leads where nome like 'Playwright %'`;
await sqlDb.end();

if (falhas.length > 0) {
  console.error("FALHAS:\n" + falhas.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
console.log("validação do site: OK");
