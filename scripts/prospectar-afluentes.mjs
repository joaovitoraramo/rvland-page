/* Funil de prospecção: busca car washes por cidade (DuckDuckGo), visita o
   site de cada um (Firefox), coleta sinais de qualidade, screenshot, e o
   Instagram oficial (linkado no próprio site, quando houver). Sem login em
   nada e em ritmo humano. Saída: prospeccao/dados-afluentes.json + fotos/. */
import { writeFileSync, mkdirSync } from "node:fs";
import { firefox } from "playwright";

const CIDADES = [
  { q: "med spa scottsdale arizona", cidade: "Scottsdale, AZ", nicho: "med spa" },
  { q: "pool service company scottsdale arizona", cidade: "Scottsdale, AZ", nicho: "piscina" },
  { q: "luxury auto detailing scottsdale arizona", cidade: "Scottsdale, AZ", nicho: "detailing" },
  { q: "pool service company naples florida", cidade: "Naples, FL", nicho: "piscina" },
  { q: "landscaping company naples florida", cidade: "Naples, FL", nicho: "landscaping" },
  { q: "roofing contractor naples florida", cidade: "Naples, FL", nicho: "roofing" },
  { q: "med spa frisco texas", cidade: "Frisco, TX", nicho: "med spa" },
  { q: "roofing contractor frisco texas", cidade: "Frisco, TX", nicho: "roofing" },
  { q: "pool builder frisco texas", cidade: "Frisco, TX", nicho: "piscina" },
  { q: "med spa boca raton florida", cidade: "Boca Raton, FL", nicho: "med spa" },
  { q: "dental office boca raton florida", cidade: "Boca Raton, FL", nicho: "odontologia" },
  { q: "hair salon boca raton florida", cidade: "Boca Raton, FL", nicho: "salao" },
  { q: "dentist bellevue washington", cidade: "Bellevue, WA", nicho: "odontologia" },
  { q: "home remodeling bellevue washington", cidade: "Bellevue, WA", nicho: "reforma" },
  { q: "landscaping company bellevue washington", cidade: "Bellevue, WA", nicho: "landscaping" },
  { q: "roofing contractor alpharetta georgia", cidade: "Alpharetta, GA", nicho: "roofing" },
  { q: "hvac company alpharetta georgia", cidade: "Alpharetta, GA", nicho: "hvac" },
  { q: "med spa alpharetta georgia", cidade: "Alpharetta, GA", nicho: "med spa" },
  { q: "pool service the woodlands texas", cidade: "The Woodlands, TX", nicho: "piscina" },
  { q: "landscaping the woodlands texas", cidade: "The Woodlands, TX", nicho: "landscaping" },
  { q: "kitchen remodeling the woodlands texas", cidade: "The Woodlands, TX", nicho: "reforma" },
  { q: "home remodeling naperville illinois", cidade: "Naperville, IL", nicho: "reforma" },
  { q: "dentist naperville illinois", cidade: "Naperville, IL", nicho: "odontologia" },
  { q: "landscaping company naperville illinois", cidade: "Naperville, IL", nicho: "landscaping" },
  { q: "hvac company cary north carolina", cidade: "Cary, NC", nicho: "hvac" },
  { q: "home remodeling cary north carolina", cidade: "Cary, NC", nicho: "reforma" },
  { q: "dentist cary north carolina", cidade: "Cary, NC", nicho: "odontologia" },
  { q: "pool builder franklin tennessee", cidade: "Franklin, TN", nicho: "piscina" },
  { q: "landscaping company franklin tennessee", cidade: "Franklin, TN", nicho: "landscaping" },
  { q: "med spa franklin tennessee", cidade: "Franklin, TN", nicho: "med spa" },
];

const EXCLUIR = [
  "yelp.", "yellowpages.", "facebook.", "instagram.", "tripadvisor.",
  "groupon.", "mapquest.", "angi.", "bbb.org", "wikipedia.", "reddit.",
  "youtube.", "foursquare.", "nextdoor.", "linkedin.", "indeed.",
  "glassdoor.", "apple.", "google.", "bing.", "duckduckgo.", "amazon.",
  "thumbtack.", "porch.", "houzz.", "booksy.", "carwashcountry.",
  "washos.", "spotless.", "expertise.", "birdeye.", "uber.", "doordash.",
];

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("prospeccao/fotos", { recursive: true });

const browser = await firefox.launch();
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0",
});
const page = await ctx.newPage();
page.setDefaultTimeout(25000);

// ── 1. buscar candidatos por cidade ─────────────────────────────────────────
const candidatos = new Map(); // dominio → { nomeBusca, cidade, url }
for (const { q, cidade, nicho } of CIDADES) {
  try {
    await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
    await espera(1500);
    const resultados = await page.$$eval("a.result__a", (as) =>
      as.map((a) => ({ href: a.href, titulo: a.textContent.trim() }))
    );
    let porCidade = 0;
    for (const r of resultados) {
      let url = r.href;
      const m = url.match(/uddg=([^&]+)/);
      if (m) url = decodeURIComponent(m[1]);
      let dominio;
      try { dominio = new URL(url).hostname.replace(/^www\./, ""); } catch { continue; }
      if (EXCLUIR.some((e) => dominio.includes(e))) continue;
      if (candidatos.has(dominio)) continue;
      candidatos.set(dominio, { nomeBusca: r.titulo, cidade, nicho, url: `https://${dominio}` });
      if (++porCidade >= 6) break;
    }
    console.log(`[busca] ${cidade}: ${porCidade} candidatos`);
  } catch (e) {
    console.log(`[busca] ${cidade} falhou: ${e.message.slice(0, 80)}`);
  }
  await espera(2000);
}

// ── 2. visitar cada site ────────────────────────────────────────────────────
const sites = [];
for (const [dominio, info] of candidatos) {
  const registro = { dominio, ...info, ok: false };
  try {
    const t0 = Date.now();
    await page.goto(registro.url, { waitUntil: "domcontentloaded" });
    await espera(2500);
    registro.carregouMs = Date.now() - t0;
    registro.urlFinal = page.url();
    registro.https = registro.urlFinal.startsWith("https");
    registro.titulo = await page.title();

    const html = await page.content();
    registro.builder =
      /wixstatic|wix\.com/i.test(html) ? "Wix" :
      /squarespace/i.test(html) ? "Squarespace" :
      /godaddy|websitebuilder/i.test(html) ? "GoDaddy" :
      /wp-content|wordpress/i.test(html) ? "WordPress" :
      /shopify/i.test(html) ? "Shopify" :
      /weebly/i.test(html) ? "Weebly" :
      /webflow/i.test(html) ? "Webflow" :
      /duda(mobile)?\./i.test(html) ? "Duda" : "custom/desconhecido";
    registro.viewportMovel = /<meta[^>]+name=["']viewport/i.test(html);
    const anos = [...html.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,20}(20\d\d)/gi)].map((m) => Number(m[1]));
    registro.anoCopyright = anos.length ? Math.max(...anos) : null;
    registro.temBooking =
      /book (now|online|an? appointment)|schedule (now|online|service)|appointment/i.test(html) ||
      /squareup\.com|calendly|acuityscheduling|setmore|vagaro|getomnify/i.test(html);
    const igs = [...html.matchAll(/instagram\.com\/([A-Za-z0-9._]{2,30})/g)]
      .map((m) => m[1].replace(/\.$/, ""))
      .filter((h) => !["p", "reel", "reels", "explore", "sharer", "accounts", "stories"].includes(h.toLowerCase()));
    registro.instagram = [...new Set(igs)][0] ?? null;
    registro.foto = `prospeccao/fotos/${dominio.replace(/[^a-z0-9.-]/gi, "_")}.png`;
    await page.screenshot({ path: registro.foto });
    registro.ok = true;
    console.log(`[site] ${dominio} ok (${registro.builder}${registro.instagram ? ", IG @" + registro.instagram : ""})`);
  } catch (e) {
    registro.erro = e.message.slice(0, 100);
    console.log(`[site] ${dominio} FALHOU: ${registro.erro}`);
  }
  sites.push(registro);
  await espera(2000);
}

// ── 3. dados públicos do Instagram (og:description, sem login) ──────────────
for (const s of sites) {
  if (!s.instagram) continue;
  try {
    await page.goto(`https://www.instagram.com/${s.instagram}/`, { waitUntil: "domcontentloaded" });
    await espera(3000);
    const og = await page
      .$eval('meta[property="og:description"]', (m) => m.content)
      .catch(() => null);
    if (og) {
      s.igMeta = og.slice(0, 200);
      const seg = og.match(/([\d.,KkMm]+)\s*Followers/);
      if (seg) s.igSeguidores = seg[1];
    }
    console.log(`[ig] @${s.instagram}: ${s.igSeguidores ?? "meta indisponível"}`);
  } catch (e) {
    console.log(`[ig] @${s.instagram} falhou: ${e.message.slice(0, 60)}`);
  }
  await espera(3500);
}

await browser.close();
writeFileSync("prospeccao/dados-afluentes.json", JSON.stringify(sites, null, 2));
const comSite = sites.filter((s) => s.ok);
console.log(`\nRESUMO: ${sites.length} candidatos, ${comSite.length} sites visitados, ${comSite.filter((s) => s.instagram).length} com Instagram no site`);
