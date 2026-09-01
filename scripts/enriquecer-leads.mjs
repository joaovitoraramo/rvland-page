/* Enriquece arquivos de prospecção com emails e seguidores de IG faltantes.
   Página NOVA por site: um travamento não contamina os seguintes (foi o que
   matou a versão anterior). Imagens/vídeo/fonte bloqueados: só precisamos do
   HTML, e assim cada site resolve em segundos.
   Uso: node enriquecer-leads.mjs <arquivo.json> [...] */
import { readFileSync, writeFileSync } from "node:fs";
import { firefox } from "playwright";

const arquivos = process.argv.slice(2);
if (arquivos.length === 0) {
  console.error("informe ao menos um arquivo json");
  process.exit(1);
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LIXO =
  /wixpress|sentry|example\.|no-?reply|@2x|\.(png|jpe?g|gif|webp|svg|css|js)$|placeholder|yourname|your@|domain\.com|schema\.org|godaddy\.com|\.wixsite|squarespace|jquery|bootstrap|fontawesome/i;
const DIRETORIO =
  /finder|directory|near ?me|browse|compare|chamber|navigator|wanderer|charm|threebest|top ?rated|guide|listing|loc8|way\.com|yelp|angi|thumbtack|porch|expertise|birdeye|consumeraffairs|todayshomeowner|yahoo|mysanantonio|explored|americatop|thebestflorida|bestinkc|momcollective|allthings|entrepreneursof|menshaircuts|barbershopamerica|preferredmechanic|atly|bestpros|totennessee|tattoospots|nearie|carwashfind|selfcarwash|touchlesscarwashfinder|bestcarwashfinders|orlandonavigator|phoenixwanderer|charlottecharm/i;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const extrair = (html) => {
  const achados = [...html.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase());
  return [...new Set(achados.filter((e) => !LIXO.test(e)))].slice(0, 3);
};

const browser = await firefox.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0",
});
// só HTML importa aqui: cortar mídia deixa cada visita em segundos
await ctx.route("**/*", (rota) => {
  const tipo = rota.request().resourceType();
  return ["image", "media", "font", "stylesheet"].includes(tipo)
    ? rota.abort()
    : rota.continue();
});

/** Roda `fn` numa página nova e sempre fecha, mesmo se travar. */
async function comPagina(fn) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
  }
}

for (const arq of arquivos) {
  const dados = JSON.parse(readFileSync(arq, "utf8"));
  console.log(`\n### ${arq} (${dados.length} registros)`);

  for (const s of dados) {
    if (!s.ok || s.emails?.length) continue;
    if (DIRETORIO.test(`${s.dominio} ${s.titulo ?? ""}`)) {
      s.descartado = true;
      continue;
    }
    try {
      s.emails = await comPagina(async (page) => {
        await page.goto(s.urlFinal ?? s.url, { waitUntil: "domcontentloaded", timeout: 12000 });
        await espera(600);
        let emails = extrair(await page.content());
        if (emails.length === 0) {
          const contato = await page
            .$$eval("a[href]", (as) =>
              as
                .map((a) => a.href)
                .find(
                  (h) =>
                    /contact|contato|about/i.test(h) &&
                    !/facebook|instagram|twitter|linkedin|mailto|tel:/i.test(h)
                )
            )
            .catch(() => null);
          if (contato) {
            await page.goto(contato, { waitUntil: "domcontentloaded", timeout: 12000 });
            await espera(600);
            emails = extrair(await page.content());
          }
        }
        return emails;
      });
      console.log(`[email] ${s.dominio}: ${s.emails.join(", ") || "nenhum"}`);
    } catch (e) {
      s.emails = [];
      console.log(`[email] ${s.dominio}: (${e.message.split("\n")[0].slice(0, 40)})`);
    }
    await espera(400);
  }

  for (const s of dados) {
    if (!s.instagram || s.igSeguidores || s.descartado) continue;
    try {
      const meta = await comPagina(async (page) => {
        await page.goto(`https://www.instagram.com/${s.instagram}/`, {
          waitUntil: "domcontentloaded",
          timeout: 12000,
        });
        await espera(1800);
        return page.$eval('meta[property="og:description"]', (m) => m.content).catch(() => null);
      });
      if (meta) {
        s.igMeta = meta.slice(0, 200);
        const seg = meta.match(/([\d.,KkMm]+)\s*Followers/);
        if (seg) s.igSeguidores = seg[1];
      }
      console.log(`[ig] @${s.instagram}: ${s.igSeguidores ?? "-"}`);
    } catch {
      console.log(`[ig] @${s.instagram}: (falhou)`);
    }
    await espera(2500);
  }

  writeFileSync(arq, JSON.stringify(dados, null, 2));
  const comEmail = dados.filter((s) => s.emails?.length).length;
  console.log(`>>> ${arq}: ${comEmail} com email, ${dados.filter((s) => s.descartado).length} descartados`);
}

await browser.close();
console.log("\nenriquecimento concluido");
