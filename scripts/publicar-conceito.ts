/* Publica um conceito numa URL da RVLand: /c/<slug>.
   Copia o HTML e as fotos para public/, troca os caminhos relativos por
   absolutos, e insere a faixa que deixa claro que aquilo é uma proposta e
   não o site no ar.

   Uso: npx tsx scripts/publicar-conceito.ts conceitos/poolguys poolguys */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";

/** Faixa + convite para ver a mesma URL no outro tipo de tela. A troca de
 *  dispositivo é a demonstração: a página se refaz sozinha, e é justamente
 *  isso que o site antigo do prospect não faz. */
function faixa(url: string, qr: string) {
  return `
<div class="rv-faixa">
  <span class="rv-faixa-texto"><strong>This is a concept</strong> &mdash; not your live site.</span>
  <button type="button" class="rv-convite rv-convite-fone" data-rv-abrir>See it on your phone</button>
  <button type="button" class="rv-convite rv-convite-pc" data-rv-abrir>See it on a big screen</button>
  <span class="rv-faixa-por">by RVLand Devs</span>
</div>

<div class="rv-modal" id="rv-modal" hidden>
  <div class="rv-modal-fundo" data-rv-fechar></div>
  <div class="rv-modal-caixa" role="dialog" aria-modal="true" aria-labelledby="rv-modal-titulo">
    <button type="button" class="rv-modal-x" data-rv-fechar aria-label="Close">&times;</button>

    <div class="rv-so-desktop">
      <h2 id="rv-modal-titulo">Open it on your phone</h2>
      <p>Point your camera at the code. It is the same page &mdash; it rebuilds itself for the smaller screen.</p>
      <img class="rv-qr" src="${qr}" alt="QR code" width="180" height="180">
    </div>

    <div class="rv-so-fone">
      <h2>Open it on a computer</h2>
      <p>Same link on a laptop. The layout expands to use the wider screen, with no pinching and no side-scrolling.</p>
    </div>

    <div class="rv-modal-url">
      <code id="rv-url">${url}</code>
      <button type="button" class="rv-copiar" data-rv-copiar>Copy</button>
    </div>
  </div>
</div>

<style>
  .rv-faixa {
    position: relative; z-index: 50;
    background: #0B1220; color: rgba(255,255,255,0.85);
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 12px; letter-spacing: 0.04em;
    padding: 9px 24px;
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  }
  .rv-faixa strong { color: #00E5FF; font-weight: 600; }
  .rv-faixa-por { margin-left: auto; color: rgba(255,255,255,0.4); }
  .rv-convite {
    font: inherit; cursor: pointer;
    background: rgba(0,229,255,0.12);
    color: #7FE9F7;
    border: 1px solid rgba(0,229,255,0.35);
    border-radius: 999px;
    padding: 4px 13px;
    transition: background .15s, border-color .15s;
  }
  .rv-convite:hover { background: rgba(0,229,255,0.2); border-color: rgba(0,229,255,0.6); }
  .rv-convite:focus-visible { outline: 2px solid #00E5FF; outline-offset: 2px; }

  /* cada tela convida para a outra */
  .rv-convite-pc, .rv-so-fone { display: none; }
  @media (max-width: 819px) {
    .rv-convite-fone, .rv-so-desktop { display: none; }
    .rv-convite-pc, .rv-so-fone { display: block; }
    .rv-faixa { padding: 9px 16px; gap: 10px; }
    .rv-faixa-por { display: none; }
    .rv-faixa-texto { width: 100%; }
  }

  .rv-modal[hidden] { display: none; }
  .rv-modal {
    position: fixed; inset: 0; z-index: 200;
    /* flex, nao grid: com justify-items:center a coluna assume a largura do
       conteudo e o width:100% da caixa passa a resolver contra ela mesma */
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .rv-modal-fundo { position: absolute; inset: 0; background: rgba(4,14,20,0.78); backdrop-filter: blur(3px); }
  .rv-modal-caixa {
    position: relative;
    /* width+max-width em vez de min(): dentro do grid a porcentagem nao
       resolvia contra a area e a caixa estourava a tela no celular */
    width: 100%;
    max-width: 400px;
    background: #0E2831;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 14px;
    padding: 30px 28px 24px;
    text-align: center;
    color: #fff;
    box-shadow: 0 30px 80px rgba(0,0,0,0.5);
    font-family: "IBM Plex Sans", system-ui, sans-serif;
  }
  .rv-modal-caixa h2 {
    font-family: "Archivo", system-ui, sans-serif;
    font-weight: 700; font-size: 21px; letter-spacing: -0.02em;
    margin: 0 0 8px;
  }
  .rv-modal-caixa p { margin: 0 0 18px; font-size: 14.5px; line-height: 1.55; color: rgba(255,255,255,0.68); }
  .rv-qr { border-radius: 10px; background: #fff; padding: 10px; display: block; margin: 0 auto 18px; }
  .rv-modal-url {
    display: flex; align-items: center; gap: 8px;
    background: rgba(0,0,0,0.28);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    padding: 8px 8px 8px 12px;
  }
  .rv-modal-url code {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 12px; color: rgba(255,255,255,0.75);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    flex: 1; text-align: left;
  }
  .rv-copiar {
    font-family: "IBM Plex Sans", system-ui, sans-serif;
    font-size: 12.5px; font-weight: 600; cursor: pointer;
    background: #00E5FF; color: #06323E;
    border: 0; border-radius: 6px; padding: 7px 13px;
    flex-shrink: 0;
  }
  .rv-modal-x {
    position: absolute; top: 10px; right: 12px;
    background: none; border: 0; cursor: pointer;
    color: rgba(255,255,255,0.4); font-size: 24px; line-height: 1;
    padding: 4px 8px;
  }
  .rv-modal-x:hover { color: #fff; }
  @media (max-width: 480px) {
    .rv-modal { padding: 16px; }
    .rv-modal-caixa { padding: 26px 20px 20px; }
    .rv-modal-caixa h2 { font-size: 19px; }
    .rv-modal-url code { font-size: 11px; }
  }
</style>

<script>
  (function () {
    var modal = document.getElementById("rv-modal");
    function abrir() { modal.hidden = false; }
    function fechar() { modal.hidden = true; }
    document.querySelectorAll("[data-rv-abrir]").forEach(function (b) {
      b.addEventListener("click", abrir);
    });
    document.querySelectorAll("[data-rv-fechar]").forEach(function (b) {
      b.addEventListener("click", fechar);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") fechar();
    });
    var copiar = document.querySelector("[data-rv-copiar]");
    copiar.addEventListener("click", function () {
      var url = document.getElementById("rv-url").textContent;
      navigator.clipboard.writeText(url).then(function () {
        copiar.textContent = "Copied";
        setTimeout(function () { copiar.textContent = "Copy"; }, 1800);
      });
    });
  })();
</script>
`;
}

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

  // caminhos absolutos: a URL final é /c/<slug>, então "fotos/x.jpg" quebraria
  html = html.replace(/(src|href)="fotos\//g, `$1="/c/${slug}/fotos/`);

  // proposta privada não entra no índice do Google
  html = html.replace("<meta charset=\"utf-8\">", `<meta charset="utf-8">\n${NOINDEX}`);

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rvland-page.vercel.app";
  const url = `${base}/c/${slug}`;
  const qr = await QRCode.toDataURL(url, {
    width: 360,
    margin: 1,
    color: { dark: "#06323E", light: "#FFFFFF" },
  });

  // a faixa evita o mal-entendido de achar que o site já está no ar, e
  // convida a abrir na outra tela — a troca É a demonstração
  html = html.replace("<body>", `<body>\n${faixa(url, qr)}`);

  mkdirSync("public/c", { recursive: true });
  writeFileSync(`public/c/${slug}.html`, html);

  if (existsSync(`${pasta}/fotos`)) {
    mkdirSync(`public/c/${slug}/fotos`, { recursive: true });
    cpSync(`${pasta}/fotos`, `public/c/${slug}/fotos`, { recursive: true });
  }

  console.log(`publicado: public/c/${slug}.html`);
  console.log(`URL: ${base}/c/${slug}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
