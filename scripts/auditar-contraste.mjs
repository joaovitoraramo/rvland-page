/* Auditoria de contraste WCAG de todo texto visível de uma página.
   Uso: node scripts/auditar-contraste.mjs <url> [largura] */
import { chromium, devices } from "playwright";

const [url, larguraArg] = process.argv.slice(2);
if (!url) { console.error("uso: auditar-contraste.mjs <url> [largura|iphone]"); process.exit(1); }

const b = await chromium.launch();
const ctx = larguraArg === "iphone"
  ? await b.newContext({ ...devices["iPhone 13"] })
  : await b.newContext({ viewport: { width: Number(larguraArg) || 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto(url, { waitUntil: "networkidle" });
await p.waitForTimeout(2000);

const resultado = await p.evaluate(() => {
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const parse = (s) => {
    const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  };
  const blend = (fg, bg) => { const a = fg[3]; return [0,1,2].map(i => Math.round(fg[i]*a + bg[i]*(1-a))); };
  // fundo efetivo: sobe a árvore até achar cor opaca; imagem de fundo = desconhecido
  const fundoDe = (el) => {
    let cor = [255,255,255,1], img = false, n = el;
    const camadas = [];
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const bg = parse(cs.backgroundColor);
      if (cs.backgroundImage !== "none" && !cs.backgroundImage.startsWith("linear-gradient(rgba(0, 0, 0, 0)")) img = true;
      if (bg && bg[3] > 0) camadas.push(bg);
      if (bg && bg[3] >= 1) break;
      n = n.parentElement;
    }
    let base = [255,255,255];
    for (const c of camadas.reverse()) base = blend(c, base);
    return { cor: base, img };
  };
  const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };

  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const vistos = new Map();
  let n;
  while ((n = w.nextNode())) {
    const t = n.textContent.trim();
    if (t.length < 2) continue;
    const el = n.parentElement;
    if (!el || el.closest(".rv-faixa, .rv-rodape, script, style, noscript")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const { cor: bgc, img } = fundoDe(el);
    const fgb = blend(fg, bgc);
    const tam = parseFloat(cs.fontSize);
    const peso = +cs.fontWeight || 400;
    const grande = tam >= 24 || (tam >= 18.66 && peso >= 700);
    const minimo = grande ? 3 : 4.5;
    const c = ratio(fgb, bgc);
    const chave = `${t.slice(0, 40)}|${cs.color}|${bgc}`;
    if (vistos.has(chave)) continue;
    vistos.set(chave, { texto: t.slice(0, 48), tam: Math.round(tam * 10) / 10, contraste: Math.round(c * 100) / 100, minimo, ok: c >= minimo, sobreImagem: img, cor: cs.color, fundo: `rgb(${bgc.join(",")})` });
  }
  return [...vistos.values()];
});

await b.close();

const falhas = resultado.filter(r => !r.ok && !r.sobreImagem);
const sobreImg = resultado.filter(r => r.sobreImagem);
const minusculos = resultado.filter(r => r.tam < 12);
console.log(`textos únicos: ${resultado.length} | reprovados (fundo sólido): ${falhas.length} | sobre imagem (não auditável): ${sobreImg.length} | abaixo de 12px: ${minusculos.length}`);
console.log();
if (falhas.length) {
  console.log("REPROVADOS (contraste < mínimo WCAG AA):");
  for (const f of falhas.sort((a, b) => a.contraste - b.contraste)) {
    console.log(`  ${String(f.contraste).padStart(5)}:1  (min ${f.minimo})  ${String(f.tam).padStart(4)}px  ${f.cor.padEnd(22)} sobre ${f.fundo.padEnd(18)} "${f.texto}"`);
  }
}
if (sobreImg.length) {
  console.log("\nSOBRE IMAGEM (conferir no olho):");
  for (const s of sobreImg) console.log(`  ${String(s.tam).padStart(4)}px  ${s.cor.padEnd(22)} "${s.texto}"`);
}
process.exit(falhas.length ? 1 : 0);
