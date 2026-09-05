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
// rola um pouco: nav fixa e afins são auditadas no estado em que passam a
// maior parte da página (sobre as seções), não no estado só-do-topo
await p.evaluate(() => window.scrollTo(0, 120));
await p.waitForTimeout(600);

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
  // Fundo efetivo: sobe a árvore acumulando camadas. Cor sólida é uma camada;
  // gradiente vira VÁRIAS candidatas (uma por parada de cor), porque o texto
  // precisa ler sobre a pior delas. Só url() de imagem é de fato desconhecido.
  const paradasDe = (bgImage) => {
    const cores = [];
    const re = /rgba?\([^)]+\)/g;
    let m;
    while ((m = re.exec(bgImage))) { const c = parse(m[0]); if (c) cores.push(c); }
    return cores;
  };
  const fundoDe = (el) => {
    let img = false, n = el;
    const camadas = []; // cada camada: lista de candidatas rgba
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const bg = parse(cs.backgroundColor);
      const bi = cs.backgroundImage;
      // camada de fundo: um filho absoluto que cobre o pai inteiro com foto
      // (ex.: .hero-fundo) é o fundo real de tudo que está dentro do pai
      for (const f of n.children) {
        if (f === el || f.contains(el)) continue;
        const fc = getComputedStyle(f);
        if (fc.position !== "absolute" || !fc.backgroundImage.includes("url(")) continue;
        const rp = n.getBoundingClientRect(), rf = f.getBoundingClientRect();
        if (rf.width >= rp.width * 0.9 && rf.height >= rp.height * 0.9) img = true;
      }
      if (bi !== "none") {
        if (bi.includes("url(")) img = true;
        const paradas = paradasDe(bi).filter(c => c[3] > 0);
        if (paradas.length) camadas.push(paradas);
      }
      if (bg && bg[3] > 0) camadas.push([bg]);
      const opaco = (bg && bg[3] >= 1) || (bi !== "none" && !bi.includes("url(") && paradasDe(bi).every(c => c[3] >= 1) && paradasDe(bi).length > 0);
      if (opaco) break;
      n = n.parentElement;
    }
    // combina de baixo para cima; a cada camada, todas as candidatas anteriores
    // recebem todas as paradas novas (produto cartesiano, limitado)
    let candidatas = [[255,255,255]];
    for (const camada of camadas.reverse()) {
      const proximas = [];
      for (const base of candidatas) for (const c of camada) proximas.push(blend(c, base));
      candidatas = proximas.slice(0, 64);
    }
    return { candidatas, img };
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
    const { candidatas, img } = fundoDe(el);
    // a pior candidata é a que vale: o texto tem que ler em todo o gradiente
    let bgc = candidatas[0], fgb = blend(fg, bgc), c = Infinity;
    for (const cand of candidatas) {
      const f = blend(fg, cand);
      const r = ratio(f, cand);
      if (r < c) { c = r; bgc = cand; fgb = f; }
    }
    const tam = parseFloat(cs.fontSize);
    const peso = +cs.fontWeight || 400;
    const grande = tam >= 24 || (tam >= 18.66 && peso >= 700);
    const minimo = grande ? 3 : 4.5;
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
