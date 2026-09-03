/* Valida a area de prospeccao do painel: importa a planilha pela propria UI,
   confere os numeros no banco e fotografa as telas. */
import { readFileSync, mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const SAIDA = ".playwright-fotos-prospeccao";
mkdirSync(SAIDA, { recursive: true });

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const { chromium } = await import("playwright");
const { default: postgres } = await import("postgres");
const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1 });

const browser = await chromium.launch();
const falhas = [];

async function tela(page, nome, largura = 1440, altura = 900, fullPage = true) {
  await page.setViewportSize({ width: largura, height: altura });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SAIDA}/${nome}.png`, fullPage });
  console.log(`foto: ${nome}`);
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") falhas.push(`console: ${m.text().slice(0, 120)}`);
});
page.on("pageerror", (e) => falhas.push(`pageerror: ${String(e).slice(0, 120)}`));

// login
await page.goto(`${BASE}/login`);
await page.fill("#email", env.SEED_ADMIN_EMAIL);
await page.fill("#senha", env.SEED_ADMIN_SENHA);
await page.click("button[type=submit]");
await page.waitForURL("**/painel", { timeout: 30000 });

// importar pela UI
await page.goto(`${BASE}/painel/prospeccao/importar`);
await tela(page, "01-importar-vazio");
await page.setInputFiles('input[name="arquivo"]', "prospeccao/planilha-leads.csv");
await page.click("form:has(input[name=arquivo]) button[type=submit]");
await page.waitForSelector("text=/novo\\(s\\) e/", { timeout: 60000 }).catch(() => {
  falhas.push("importacao nao confirmou");
});
await tela(page, "02-importado");

const [{ n }] = await sql`select count(*)::int as n from prospeccao`;
console.log(`banco: ${n} prospects`);
if (n < 100) falhas.push(`esperava 100+ prospects, veio ${n}`);

// reimportar: status e notas nao podem ser perdidos
const [alvo] = await sql`select id, dominio from prospeccao order by potencial desc limit 1`;
await sql`update prospeccao set status='negociando', notas='nota de teste' where id=${alvo.id}`;
await page.goto(`${BASE}/painel/prospeccao/importar`);
await page.setInputFiles('input[name="arquivo"]', "prospeccao/planilha-leads.csv");
await page.click("form:has(input[name=arquivo]) button[type=submit]");
await page.waitForSelector("text=/preservados/", { timeout: 60000 }).catch(() => {});
const [depois] = await sql`select status, notas from prospeccao where id=${alvo.id}`;
if (depois.status !== "negociando" || depois.notas !== "nota de teste") {
  falhas.push(`reimportacao apagou trabalho: status=${depois.status} notas=${depois.notas}`);
} else {
  console.log("reimportacao preservou status e notas: OK");
}

// contato editado a mao tem de sobreviver a reimportacao
const [semContato] = await sql`
  select id, dominio from prospeccao
  where (emails is null or emails = '') and (instagram is null or instagram = '')
  order by potencial desc limit 1`;
if (semContato) {
  await page.goto(`${BASE}/painel/prospeccao/${semContato.id}`);
  await page.click("button:has-text('Adicionar contato')");
  await page.waitForSelector("#emails", { state: "visible" });
  await page.waitForTimeout(600); // React acaba de montar o form; deixa estabilizar
  await page.fill("#emails", "achado@manualmente.com");
  await page.fill("#instagram", "https://instagram.com/achadoamao/");
  await page.fill("#telefone", "(555) 222-3344");
  // confere que os valores sobreviveram ao render antes de submeter
  if ((await page.inputValue("#emails")) !== "achado@manualmente.com") {
    await page.fill("#emails", "achado@manualmente.com");
  }
  await page.click("form:has(#emails) button[type=submit]");
  await page.waitForSelector("text=/vai sobrescrever/", { timeout: 20000 }).catch(() => {
    falhas.push("nao confirmou o salvamento do contato");
  });
  await tela(page, "09-contato-editado");

  const [salvo] = await sql`select emails, instagram, telefone, contato_manual from prospeccao where id=${semContato.id}`;
  if (salvo.emails !== "achado@manualmente.com") falhas.push(`email nao gravou: ${salvo.emails}`);
  if (salvo.instagram !== "@achadoamao") falhas.push(`instagram nao normalizou: ${salvo.instagram}`);
  if (!salvo.contato_manual) falhas.push("contato_manual nao foi marcado");

  await page.goto(`${BASE}/painel/prospeccao/importar`);
  await page.setInputFiles('input[name="arquivo"]', "prospeccao/planilha-leads.csv");
  await page.click("form:has(input[name=arquivo]) button[type=submit]");
  await page.waitForSelector("text=/preservados/", { timeout: 60000 }).catch(() => {});
  const [depoisImport] = await sql`select emails, instagram, telefone from prospeccao where id=${semContato.id}`;
  if (depoisImport.emails !== "achado@manualmente.com" || depoisImport.telefone !== "(555) 222-3344") {
    falhas.push(`reimportacao apagou o contato manual: ${JSON.stringify(depoisImport)}`);
  } else {
    console.log("contato manual sobreviveu a reimportacao: OK");
  }
} else {
  console.log("(sem prospect sem contato para testar edicao manual)");
}

// dashboard
await page.goto(`${BASE}/painel/prospeccao`);
await tela(page, "03-dashboard");
const corpo = await page.textContent("body");
for (const esperado of ["Funil comercial", "Temperatura da carteira", "Nichos", "Cidades"]) {
  if (!corpo.includes(esperado)) falhas.push(`dashboard sem "${esperado}"`);
}

// filtro
await page.selectOption('select[name="temp"]', "quente");
await page.click("form:has(select[name=temp]) button[type=submit]");
await page.waitForTimeout(1200);
await tela(page, "04-filtro-quentes");

// detalhe
await page.click("table a:has-text('Abrir')");
await page.waitForURL("**/painel/prospeccao/**");
await tela(page, "05-detalhe");
const det = await page.textContent("body");
for (const esperado of ["Como abordar", "O que vi no site", "Acompanhamento", "Print do site"]) {
  if (!det.includes(esperado)) falhas.push(`detalhe sem "${esperado}"`);
}

// mover etapa pelo funil
const urlDetalhe = page.url();
await page.click("button:has-text('Respondeu')");
await page.click('button[type="submit"]:has-text("Salvar")');
await page.waitForSelector("text=/Movido para|Notas salvas/", { timeout: 20000 }).catch(() => {
  falhas.push("nao confirmou a mudanca de etapa");
});
await tela(page, "06-etapa-movida");
const id = urlDetalhe.split("/").pop();
const [mov] = await sql`select status, contatado_em from prospeccao where id=${id}`;
console.log(`etapa apos clique: ${mov.status}`);
if (mov.status !== "respondeu") falhas.push(`status nao gravou: ${mov.status}`);

// mobile
await page.goto(`${BASE}/painel/prospeccao`);
await tela(page, "07-mobile-dashboard", 390, 844);
await page.goto(urlDetalhe);
await tela(page, "08-mobile-detalhe", 390, 844);

await browser.close();
await sql.end();

if (falhas.length > 0) {
  console.error("FALHAS:\n" + falhas.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
console.log("validacao da prospeccao: OK");
