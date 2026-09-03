/* Publica um conceito numa URL da RVLand: /c/<slug>.
   Copia o HTML e as fotos para public/, troca os caminhos relativos por
   absolutos, e insere a faixa que deixa claro que aquilo é uma proposta e
   não o site no ar.

   Uso: npx tsx scripts/publicar-conceito.ts conceitos/poolguys poolguys */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const FAIXA = `
<div class="rv-faixa-conceito">
  <span><strong>This is a concept</strong> &mdash; not your live site.</span>
  <span class="rv-faixa-por">Prepared by RVLand Devs</span>
</div>
<style>
  .rv-faixa-conceito {
    position: relative; z-index: 50;
    background: #0B1220; color: rgba(255,255,255,0.85);
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 12px; letter-spacing: 0.04em;
    padding: 10px 24px;
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  }
  .rv-faixa-conceito strong { color: #00E5FF; font-weight: 600; }
  .rv-faixa-por { margin-left: auto; color: rgba(255,255,255,0.45); }
</style>
`;

const NOINDEX = '<meta name="robots" content="noindex, nofollow">';

async function main() {
  const [pasta, slug] = process.argv.slice(2);
  if (!pasta || !slug) throw new Error("uso: publicar-conceito.ts <pasta> <slug>");

  const origem = `${pasta}/index.html`;
  if (!existsSync(origem)) throw new Error(`não achei ${origem}`);

  let html = readFileSync(origem, "utf8");

  // caminhos absolutos: a URL final é /c/<slug>, então "fotos/x.jpg" quebraria
  html = html.replace(/(src|href)="fotos\//g, `$1="/c/${slug}/fotos/`);

  // proposta privada não entra no índice do Google
  html = html.replace("<meta charset=\"utf-8\">", `<meta charset="utf-8">\n${NOINDEX}`);

  // a faixa evita o mal-entendido de achar que o site já está no ar
  html = html.replace("<body>", `<body>\n${FAIXA}`);

  mkdirSync("public/c", { recursive: true });
  writeFileSync(`public/c/${slug}.html`, html);

  if (existsSync(`${pasta}/fotos`)) {
    mkdirSync(`public/c/${slug}/fotos`, { recursive: true });
    cpSync(`${pasta}/fotos`, `public/c/${slug}/fotos`, { recursive: true });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rvland-page.vercel.app";
  console.log(`publicado: public/c/${slug}.html`);
  console.log(`URL: ${base}/c/${slug}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
