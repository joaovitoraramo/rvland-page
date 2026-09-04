/**
 * Faixa e rodapé da RVLand aplicados por cima de qualquer conceito.
 *
 * São componentes: conceito novo não reescreve nada disso, só informa as
 * cores em `faixaCores` no conceito.json para a camada da RVLand conversar
 * com a paleta daquela peça. Sem essas cores, valem as da RVLand.
 */

export type FaixaCores = {
  fundo: string;
  texto: string;
  acento: string;
  acentoTexto: string;
  modalFundo: string;
};

export const CORES_RVLAND: FaixaCores = {
  fundo: "#0B1220",
  texto: "rgba(255,255,255,0.85)",
  acento: "#00E5FF",
  acentoTexto: "#06232B",
  modalFundo: "#0E2831",
};

export type DadosFaixa = {
  /** URL pública do conceito, usada no QR e no botão de copiar. */
  url: string;
  /** QR do próprio conceito, em data URI. */
  qr: string;
  /** Página de preços da RVLand. */
  precos: string;
  /** Nome do negócio, para o rodapé. */
  cliente: string;
  cores?: Partial<FaixaCores>;
};

const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';
const SANS = '"IBM Plex Sans", system-ui, -apple-system, sans-serif';
const DISPLAY = '"Archivo", system-ui, -apple-system, sans-serif';

/** Vai logo depois de <body>: identifica a peça e convida à ação. */
export function faixaTopo({ url, qr, precos, cores }: Omit<DadosFaixa, "cliente">) {
  const c = { ...CORES_RVLAND, ...cores };

  return `
<div class="rv-faixa">
  <span class="rv-faixa-texto"><strong>This is a concept</strong>, not your live site.</span>
  <span class="rv-acoes">
    <button type="button" class="rv-convite rv-convite-fone" data-rv-abrir="rv-modal-tela">See it on your phone</button>
    <button type="button" class="rv-convite rv-convite-pc" data-rv-abrir="rv-modal-tela">
      <span class="rv-longo">See it on a big screen</span><span class="rv-curto">On desktop</span>
    </button>
    <button type="button" class="rv-preco" data-rv-abrir="rv-modal-preco">
      <span class="rv-longo">What does this cost? &rarr;</span><span class="rv-curto">What&rsquo;s the cost? &rarr;</span>
    </button>
  </span>
  <span class="rv-faixa-por">by RVLand Devs</span>
</div>

<div class="rv-modal" id="rv-modal-tela" hidden>
  <div class="rv-modal-fundo" data-rv-fechar></div>
  <div class="rv-modal-caixa" role="dialog" aria-modal="true" aria-labelledby="rv-tela-titulo">
    <button type="button" class="rv-modal-x" data-rv-fechar aria-label="Close">&times;</button>

    <div class="rv-so-desktop">
      <h2 id="rv-tela-titulo">Open it on your phone</h2>
      <p>Point your camera at the code. It is the same page. It rebuilds itself for the smaller screen.</p>
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
      I built this concept on my own time. No invoice is coming for it, and it
      stays yours either way, even if you close this tab and never reply.
    </p>

    <hr class="rv-divisor">

    <p class="rv-pergunta">Want it to be your actual website?</p>
    <p>
      That is the part with a price: the live site, the client area, the forms,
      hosting and support. It is all on one page, in plain numbers, with no
      meeting, no quote to request.
    </p>

    <a class="rv-botao-preco" href="${precos}" target="_blank" rel="noreferrer">See what it costs &rarr;</a>
    <button type="button" class="rv-depois" data-rv-fechar>Not now, I'll keep looking</button>
  </div>
</div>

<style>
  .rv-faixa {
    position: relative; z-index: 50;
    background: ${c.fundo}; color: ${c.texto};
    font-family: ${MONO};
    font-size: 12px; letter-spacing: 0.04em;
    padding: 9px 24px;
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  }
  .rv-faixa strong { color: ${c.acento}; font-weight: 600; }
  .rv-faixa-por { margin-left: auto; opacity: 0.5; }
  .rv-convite {
    font: inherit; cursor: pointer;
    background: color-mix(in srgb, ${c.acento} 14%, transparent);
    color: ${c.acento};
    border: 1px solid color-mix(in srgb, ${c.acento} 40%, transparent);
    border-radius: 999px;
    padding: 4px 13px;
    transition: background .15s, border-color .15s;
  }
  .rv-convite:hover {
    background: color-mix(in srgb, ${c.acento} 24%, transparent);
    border-color: color-mix(in srgb, ${c.acento} 65%, transparent);
  }
  .rv-convite:focus-visible { outline: 2px solid ${c.acento}; outline-offset: 2px; }

  .rv-preco {
    font: inherit; cursor: pointer;
    background: ${c.acento}; color: ${c.acentoTexto};
    font-weight: 600; border: 0;
    border-radius: 999px;
    padding: 5px 15px;
    white-space: nowrap;
    transition: filter .15s;
  }
  .rv-preco:hover { filter: brightness(1.1); }
  .rv-preco:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

  .rv-acoes { display: contents; }
  .rv-curto { display: none; }

  /* cada tela convida para a outra */
  .rv-convite-pc, .rv-so-fone { display: none; }
  @media (max-width: 819px) {
    .rv-convite-fone, .rv-so-desktop { display: none; }
    .rv-convite-pc, .rv-so-fone { display: block; }
    .rv-faixa { padding: 10px 16px; gap: 9px; }
    .rv-faixa-por { display: none; }
    .rv-faixa-texto { width: 100%; }

    /* os dois botões dividem uma linha só: empilhados viravam três linhas de
       barra, e barra alta com pílulas soltas não passa credibilidade */
    .rv-acoes { display: flex; width: 100%; gap: 8px; }
    .rv-acoes > * { flex: 1; text-align: center; }
    .rv-longo { display: none; }
    .rv-curto { display: inline; }
    .rv-convite, .rv-preco {
      font-size: 11.5px;
      padding: 7px 10px;
      white-space: nowrap;
    }
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
    width: 100%; max-width: 400px;
    background: ${c.modalFundo};
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 14px;
    padding: 30px 28px 24px;
    text-align: center; color: #fff;
    box-shadow: 0 30px 80px rgba(0,0,0,0.5);
    font-family: ${SANS};
    max-height: calc(100vh - 48px);
    overflow-y: auto;
  }
  .rv-caixa-preco { max-width: 440px; text-align: left; }
  .rv-modal-caixa h2 {
    font-family: ${DISPLAY};
    font-weight: 700; font-size: 21px; letter-spacing: -0.02em;
    margin: 0 0 8px;
  }
  .rv-modal-caixa p { margin: 0 0 18px; font-size: 14.5px; line-height: 1.55; color: rgba(255,255,255,0.68); }
  .rv-qr { border-radius: 10px; background: #fff; padding: 10px; display: block; margin: 0 auto 18px; }

  .rv-selo {
    display: inline-block;
    background: rgba(0,255,138,0.14); color: #6BF0B4;
    border: 1px solid rgba(0,255,138,0.3);
    border-radius: 999px;
    font-family: ${MONO};
    font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase;
    padding: 3px 10px; margin-bottom: 12px;
  }
  .rv-divisor { border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 4px 0 18px; }
  .rv-pergunta {
    font-family: ${DISPLAY};
    font-weight: 700; font-size: 17px; letter-spacing: -0.015em;
    color: #fff; margin-bottom: 8px;
  }
  .rv-botao-preco {
    display: block; text-align: center; text-decoration: none;
    background: ${c.acento}; color: ${c.acentoTexto};
    font-weight: 600; font-size: 15px;
    border-radius: 8px; padding: 13px 18px;
    transition: filter .15s;
  }
  .rv-botao-preco:hover { filter: brightness(1.1); }
  .rv-depois {
    display: block; width: 100%;
    margin-top: 10px; padding: 9px;
    background: none; border: 0; cursor: pointer;
    font-family: ${SANS};
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
    font-family: ${MONO};
    font-size: 12px; color: rgba(255,255,255,0.75);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    flex: 1; text-align: left;
  }
  .rv-copiar {
    font-family: ${SANS};
    font-size: 12.5px; font-weight: 600; cursor: pointer;
    background: ${c.acento}; color: ${c.acentoTexto};
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

  .rv-rodape {
    background: ${c.fundo}; color: ${c.texto};
    font-family: ${MONO};
    font-size: 12px; letter-spacing: 0.04em;
    padding: 18px 24px;
    display: flex; align-items: center; justify-content: center;
    gap: 8px 18px; flex-wrap: wrap;
    opacity: 0.85;
  }
  .rv-rodape a { color: ${c.acento}; text-decoration: none; }
  .rv-rodape a:hover { text-decoration: underline; }
  .rv-rodape b { color: ${c.acento}; font-weight: 600; }
  .rv-rodape-links { display: inline-flex; align-items: center; gap: 10px; }
  .rv-rodape-sep { opacity: 0.3; }

  @media (max-width: 480px) {
    .rv-modal { padding: 16px; }
    .rv-modal-caixa { padding: 26px 20px 20px; }
    .rv-modal-caixa h2 { font-size: 19px; }
    .rv-pergunta { font-size: 16px; }
    .rv-modal-url code { font-size: 11px; }
    /* no celular o flex-wrap quebrava em pontos aleatórios e a assinatura
       colava na URL; em coluna cada informação ganha a própria linha */
    .rv-rodape {
      flex-direction: column;
      gap: 7px;
      padding: 20px 20px 22px;
      text-align: center;
      line-height: 1.5;
      font-size: 11.5px;
    }
    .rv-rodape-links { gap: 8px; }
  }
</style>

<script>
  (function () {
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
    // o preço abre em outra aba; ao voltar, ninguém quer achar o modal aberto
    var irPreco = document.querySelector(".rv-botao-preco");
    if (irPreco) irPreco.addEventListener("click", fechar);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") fechar();
    });
    var copiar = document.querySelector("[data-rv-copiar]");
    if (copiar) {
      copiar.addEventListener("click", function () {
        navigator.clipboard.writeText(document.getElementById("rv-url").textContent).then(function () {
          copiar.textContent = "Copied";
          setTimeout(function () { copiar.textContent = "Copy"; }, 1800);
        });
      });
    }
  })();
</script>
`;
}

/** Vai antes de </body>: assina a peça sem competir com o conteúdo. */
export function rodapeCredito({ cliente, site }: { cliente: string; site: string }) {
  return `
<div class="rv-rodape">
  <span>Website concept prepared for ${cliente}</span>
  <span>by <b>RVLand Devs</b></span>
  <span class="rv-rodape-links">
    <a href="${site}/en" target="_blank" rel="noreferrer">${site.replace(/^https?:\/\//, "")}/en</a>
    <span class="rv-rodape-sep">&middot;</span>
    <a href="https://instagram.com/rvlanddevs" target="_blank" rel="noreferrer">@rvlanddevs</a>
  </span>
</div>
`;
}
