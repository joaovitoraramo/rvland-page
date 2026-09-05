/* Publica um conceito numa URL da RVLand: /c/<slug>.
   Copia o HTML e as fotos para public/, troca os caminhos relativos por
   absolutos e aplica os componentes da RVLand (faixa do topo e crédito do
   rodapé), com as cores vindas de `faixaCores` no conceito.json.

   Uso: npx tsx scripts/publicar-conceito.ts conceitos/poolguys poolguys */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";

import { faixaTopo, rodapeCredito } from "./lib-faixa-conceito";
import { medidorDeVisitas } from "./lib-medidor-conceito";

const NOINDEX = '<meta name="robots" content="noindex, nofollow">';

async function main() {
  const [pasta, slug] = process.argv.slice(2);
  if (!pasta || !slug) throw new Error("uso: publicar-conceito.ts <pasta> <slug>");

  const origem = `${pasta}/index.html`;
  if (!existsSync(origem)) throw new Error(`não achei ${origem}`);

  let html = readFileSync(origem, "utf8");

  // Sem meta viewport o celular renderiza a 980px e mostra a página de
  // desktop encolhida — exatamente o defeito que a gente aponta no site do
  // prospect. Publicar assim seria vergonhoso, então nem deixa.
  if (!/<meta\s+name=["']viewport["']/i.test(html)) {
    throw new Error(
      `${origem} não tem <meta name="viewport">: no celular ele abriria em ` +
        `largura de desktop. Acrescente antes de publicar.`
    );
  }

  // cliente e cores da camada RVLand vêm do conceito.json, quando existe
  const caminhoJson = `${pasta}/conceito.json`;
  const conceito = existsSync(caminhoJson)
    ? JSON.parse(readFileSync(caminhoJson, "utf8"))
    : {};
  const cliente = conceito.cliente ?? slug;

  // caminhos absolutos: a URL final é /c/<slug>, então "fotos/x.jpg" quebraria
  html = html.replace(/(src|href)="fotos\//g, `$1="/c/${slug}/fotos/`);
  // ...e tambem os fundos em CSS: url("fotos/x.jpg") dentro de <style>
  html = html.replace(/url\((["']?)fotos\//g, `url($1/c/${slug}/fotos/`);

  // proposta privada não entra no índice do Google
  html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n${NOINDEX}`);

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rvland-page.vercel.app";
  const url = `${base}/c/${slug}`;
  const qr = await QRCode.toDataURL(url, {
    width: 360,
    margin: 1,
    color: { dark: "#06323E", light: "#FFFFFF" },
  });

  // ref=<slug> avisa a /en que o visitante já tem o conceito na mão, e marca
  // o lead com a origem se ele preencher o formulário
  html = html.replace(
    "<body>",
    `<body>\n${faixaTopo({ url, qr, precos: `${base}/en?section=pricing&ref=${slug}`, cores: conceito.faixaCores })}`
  );
  html = html.replace(
    "</body>",
    `${rodapeCredito({ cliente, site: base })}${medidorDeVisitas({ slug, api: "/api/c/visita" })}\n</body>`
  );

  mkdirSync("public/c", { recursive: true });
  writeFileSync(`public/c/${slug}.html`, html);

  if (existsSync(`${pasta}/fotos`)) {
    mkdirSync(`public/c/${slug}/fotos`, { recursive: true });
    cpSync(`${pasta}/fotos`, `public/c/${slug}/fotos`, { recursive: true });
  }

  console.log(`publicado: public/c/${slug}.html`);
  console.log(`cliente: ${cliente} | cores: ${conceito.faixaCores ? "do conceito" : "padrão RVLand"}`);
  console.log(`URL: ${base}/c/${slug}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
