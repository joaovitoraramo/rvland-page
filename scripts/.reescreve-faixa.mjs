import { readFileSync, writeFileSync } from "node:fs";

const ARQ = "scripts/publicar-conceito.ts";
const s = readFileSync(ARQ, "utf8");

const linhas = s.split("\n");
const inicio = linhas.findIndex((l) => l.startsWith("/** Faixa + convite"));
const fim = linhas.findIndex((l, i) => i > inicio && l === "}");
if (inicio === -1 || fim === -1) throw new Error("não achei os limites da função faixa()");

const NOVA = String.raw`/** Faixa da RVLand sobre o conceito. Dois convites: trocar de tela (a
 *  demonstração de que a página se refaz sozinha) e descobrir o preço — este
 *  passando antes por um modal que separa o desenho, que é de graça, da
 *  construção, que é o trabalho pago. */
function faixa(url: string, qr: string, precos: string) {
  return ` + "`" + String.raw`
<div class="rv-faixa">
  <span class="rv-faixa-texto"><strong>This is a concept</strong> &mdash; not your live site.</span>
  <button type="button" class="rv-convite rv-convite-fone" data-rv-abrir="rv-modal-tela">See it on your phone</button>
  <button type="button" class="rv-convite rv-convite-pc" data-rv-abrir="rv-modal-tela">See it on a big screen</button>
  <button type="button" class="rv-preco" data-rv-abrir="rv-modal-preco">What does this cost? &rarr;</button>
  <span class="rv-faixa-por">by RVLand Devs</span>
</div>

<div class="rv-modal" id="rv-modal-tela" hidden>
  <div class="rv-modal-fundo" data-rv-fechar></div>
  <div class="rv-modal-caixa" role="dialog" aria-modal="true" aria-labelledby="rv-tela-titulo">
    <button type="button" class="rv-modal-x" data-rv-fechar aria-label="Close">&times;</button>

    <div class="rv-so-desktop">
      <h2 id="rv-tela-titulo">Open it on your phone</h2>
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

<div class="rv-modal" id="rv-modal-preco" hidden>
  <div class="rv-modal-fundo" data-rv-fechar></div>
  <div class="rv-modal-caixa rv-caixa-preco" role="dialog" aria-modal="true" aria-labelledby="rv-preco-titulo">
    <button type="button" class="rv-modal-x" data-rv-fechar aria-label="Close">&times;</button>

    <span class="rv-selo">Free</span>
    <h2 id="rv-preco-titulo">This part costs you nothing</h2>
    <p>
      I built this concept on my own time. No invoice is coming for it, and it is
      yours to keep either way &mdash; even if you close this tab and never reply.
    </p>
    <hr class="rv-divisor">
    <p class="rv-pergunta">Want it to be your actual website?</p>
    <p>
      That is the part with a price: the live site, the client area, the forms,
      hosting and support. It is published on one page, in plain numbers, with
      no meeting and no quote to request.
    </p>
    <a class="rv-botao-preco" href="${precos}" target="_blank" rel="noreferrer">See what it costs &rarr;</a>
    <button type="button" class="rv-depois" data-rv-fechar>Not now &mdash; just keep looking</button>
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

  .rv-preco {
    font: inherit; cursor: pointer;
    background: #00E5FF; color: #06232B;
    font-weight: 600; border: 0;
    border-radius: 999px;
    padding: 5px 15px;
    white-space: nowrap;
    transition: filter .15s;
  }
  .rv-preco:hover { filter: brightness(1.08); }
  .rv-preco:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

  /* cada tela convida para a outra */
  .rv-convite-pc, .rv-so-fone { display: none; }
  @media (max-width: 819px) {
    .rv-convite-fone, .rv-so-desktop { display: none; }
    .rv-convite-pc, .rv-so-fone { display: block; }
    .rv-faixa { padding: 9px 16px; gap: 8px; }
    .rv-faixa-por { display: none; }
    .rv-faixa-texto { width: 100%; }
    .rv-convite, .rv-preco { font-size: 11.5px; padding: 5px 11px; }
  }

  .rv-modal[hidden] { display: none; }
  .rv-modal {
    position: fixed; inset: 0; z-index: 200;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .rv-modal-fundo { position: absolute; inset: 0; background: rgba(4,14,20,0.78); backdrop-filter: blur(3px); }
  .rv-modal-caixa {
    position: relative;
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
    max-height: calc(100vh - 48px);
    overflow-y: auto;
  }
  .rv-caixa-preco { max-width: 440px; text-align: left; }
  .rv-modal-caixa h2 {
    font-family: "Archivo", system-ui, sans-serif;
    font-weight: 700; font-size: 21px; letter-spacing: -0.02em;
    margin: 0 0 8px;
  }
  .rv-modal-caixa p { margin: 0 0 18px; font-size: 14.5px; line-height: 1.55; color: rgba(255,255,255,0.68); }
  .rv-qr { border-radius: 10px; background: #fff; padding: 10px; display: block; margin: 0 auto 18px; }

  .rv-selo {
    display: inline-block;
    background: rgba(0,255,138,0.14);
    color: #6BF0B4;
    border: 1px solid rgba(0,255,138,0.3);
    border-radius: 999px;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase;
    padding: 3px 10px;
    margin-bottom: 12px;
  }
  .rv-divisor { border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 4px 0 18px; }
  .rv-pergunta {
    font-family: "Archivo", system-ui, sans-serif;
    font-weight: 700; font-size: 17px; letter-spacing: -0.015em;
    color: #fff !important; margin-bottom: 8px !important;
  }
  .rv-botao-preco {
    display: block; text-align: center; text-decoration: none;
    background: #00E5FF; color: #06232B;
    font-weight: 600; font-size: 15px;
    border-radius: 8px; padding: 13px 18px;
    transition: filter .15s;
  }
  .rv-botao-preco:hover { filter: brightness(1.08); }
  .rv-depois {
    display: block; width: 100%;
    margin-top: 10px; padding: 9px;
    background: none; border: 0; cursor: pointer;
    font-family: "IBM Plex Sans", system-ui, sans-serif;
    font-size: 13px; color: rgba(255,255,255,0.42);
  }
  .rv-depois:hover { color: rgba(255,255,255,0.7); }

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
    var abertos = [];
    function fechar() {
      document.querySelectorAll(".rv-modal").forEach(function (m) { m.hidden = true; });
    }
    document.querySelectorAll("[data-rv-abrir]").forEach(function (b) {
      b.addEventListener("click", function () {
        fechar();
        var alvo = document.getElementById(b.getAttribute("data-rv-abrir"));
        if (alvo) alvo.hidden = false;
      });
    });
    document.querySelectorAll("[data-rv-fechar]").forEach(function (b) {
      b.addEventListener("click", fechar);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") fechar();
    });
    var copiar = document.querySelector("[data-rv-copiar]");
    copiar.addEventListener("click", function () {
      navigator.clipboard.writeText(document.getElementById("rv-url").textContent).then(function () {
        copiar.textContent = "Copied";
        setTimeout(function () { copiar.textContent = "Copy"; }, 1800);
      });
    });
  })();
</script>
` + "`" + String.raw`;
}`;

const novo = [...linhas.slice(0, inicio), NOVA, ...linhas.slice(fim + 1)].join("\n");
writeFileSync(ARQ, novo);
console.log(`faixa() reescrita: linhas ${inicio + 1}–${fim + 1} → ${NOVA.split("\n").length} linhas`);
