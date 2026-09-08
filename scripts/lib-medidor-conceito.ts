/**
 * Medidor de abertura e de cliques dos conceitos, injetado pelo publicador.
 *
 * A regra que define o valor do dado: só conta depois de alguns segundos com a
 * aba de fato VISÍVEL. O varredor de link do provedor de e-mail busca a página
 * mas não fica olhando para ela, então some sozinho desse filtro. Sem isso o
 * primeiro aviso viria de um antivírus minutos depois do envio.
 *
 * Os cliques (link, botão, aba, grupo do menu) entram numa fila e saem juntos
 * depois de alguns segundos: uma mensagem só no Telegram por lote, na ordem em
 * que aconteceu. Quando o clique leva para fora da página, o lote vai na hora.
 *
 * Falha em silêncio de ponta a ponta: é uma página de venda, e nada aqui pode
 * aparecer para o prospect.
 */

/** Segundos de aba visível antes de considerar que alguém abriu de verdade. */
const SEGUNDOS_PARA_CONTAR = 5;

/** Segundos juntando cliques antes de mandar o lote. */
const SEGUNDOS_DO_LOTE = 6;

export function medidorDeVisitas({
  slug,
  api,
  apiCliques = api.replace(/visita$/, "clique"),
}: {
  slug: string;
  api: string;
  apiCliques?: string;
}): string {
  const SLUG = JSON.stringify(slug);
  const API = JSON.stringify(api);
  const API_CLIQUES = JSON.stringify(apiCliques);

  return `
<script>
(function () {
  try {
    var CHAVE = "rv-visitante";
    var DESLIGA = "rv-sem-medida";

    // ?rvland=1 desliga a medição neste navegador para sempre: as visitas do
    // próprio João não podem virar alerta nem entrar na conta
    try {
      if (new URLSearchParams(location.search).get("rvland") === "1") {
        localStorage.setItem(DESLIGA, "1");
      }
      if (localStorage.getItem(DESLIGA)) return;
    } catch (e) {}

    function id() {
      var s = "";
      while (s.length < 24) s += Math.random().toString(36).slice(2);
      return s.slice(0, 24);
    }

    var visitante;
    try {
      visitante = localStorage.getItem(CHAVE);
      if (!visitante) { visitante = id(); localStorage.setItem(CHAVE, visitante); }
    } catch (e) { visitante = id(); }

    var sessao = id();
    var visiveis = 0;
    var marcou = false;
    var ultimo = Date.now();

    function postar(url, corpo, saindo) {
      try {
        // sendBeacon sobrevive ao fechamento da aba; fetch normal não
        if (saindo && navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([corpo], { type: "application/json" }));
        } else {
          fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: corpo, keepalive: true });
        }
      } catch (e) {}
    }

    function enviar(saindo) {
      postar(${API}, JSON.stringify({
        slug: ${SLUG},
        visitante: visitante,
        sessao: sessao,
        segundos: Math.round(visiveis),
        referencia: document.referrer || null
      }), saindo);
    }

    function contar() {
      if (document.visibilityState === "visible") visiveis += (Date.now() - ultimo) / 1000;
      ultimo = Date.now();
      if (!marcou && visiveis >= ${SEGUNDOS_PARA_CONTAR}) { marcou = true; enviar(false); }
    }

    setInterval(contar, 1000);

    // ── cliques: o que a pessoa foi ver ──────────────────────────────────
    var fila = [];
    var temporizador = null;
    var ultimoRotulo = "";
    var ultimoEm = 0;

    var LUGARES = [
      [".rv-faixa, .rv-modal", "faixa RVLand"],
      [".chat", "chat"],
      [".dock", "dock"],
      [".menu-cel", "menu"],
      [".mega", "mega-menu"],
      [".aviso", "aviso de escopo"],
      ["header", "nav"],
      ["footer", "rodapé"]
    ];

    // junta os nós de texto com espaço: "Botox & Dysport" + "smooth" em spans
    // vizinhos viraria "Botox & Dysportsmooth" com textContent
    function texto(el) {
      var t = el.getAttribute("aria-label") || "";
      if (!t) {
        var partes = [];
        var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        var n; while ((n = w.nextNode())) { var v = n.textContent.replace(/\\s+/g, " ").trim(); if (v) partes.push(v); }
        t = partes.join(" ");
      }
      if (!t) { var img = el.querySelector("img"); if (img && img.alt) t = img.alt; }
      return t.slice(0, 80);
    }

    function lugar(el) {
      for (var i = 0; i < LUGARES.length; i++) {
        if (el.closest(LUGARES[i][0])) return LUGARES[i][1];
      }
      var sec = el.closest("section");
      if (sec) return sec.id || (sec.className || "").split(" ")[0] || "section";
      var dlg = el.closest("[role=dialog][aria-label]");
      if (dlg) return dlg.getAttribute("aria-label");
      return null;
    }

    function enviarCliques(saindo) {
      clearTimeout(temporizador); temporizador = null;
      if (!fila.length) return;
      postar(${API_CLIQUES}, JSON.stringify({
        slug: ${SLUG},
        visitante: visitante,
        sessao: sessao,
        itens: fila.splice(0, 30)
      }), saindo);
    }

    document.addEventListener("click", function (ev) {
      try {
        var alvo = ev.target && ev.target.closest && ev.target.closest("a, button, summary, [role=tab], [role=button], label");
        if (!alvo) return;
        var rotulo = texto(alvo);
        if (!rotulo) return;
        // clique duplo no mesmo lugar não vira dois registros
        var agora = Date.now();
        if (rotulo === ultimoRotulo && agora - ultimoEm < 1000) return;
        ultimoRotulo = rotulo; ultimoEm = agora;

        var destino = alvo.tagName === "A" ? (alvo.getAttribute("href") || null) : null;
        if (destino && destino.charAt(0) !== "#" && destino.indexOf(":") === -1) {
          try { destino = new URL(destino, location.href).href; } catch (e) {}
        }
        fila.push({ rotulo: rotulo, secao: lugar(alvo), destino: destino });

        // link que sai da página: o lote vai agora, antes de a aba mudar
        var sai = alvo.tagName === "A" && destino && destino.charAt(0) !== "#" && alvo.getAttribute("target") !== "_blank";
        if (sai) { enviarCliques(true); return; }
        if (!temporizador) temporizador = setTimeout(function () { enviarCliques(false); }, ${SEGUNDOS_DO_LOTE * 1000});
      } catch (e) {}
    }, true);

    document.addEventListener("visibilitychange", function () {
      contar();
      if (document.visibilityState === "hidden") { if (marcou) enviar(true); enviarCliques(true); }
    });
    window.addEventListener("pagehide", function () {
      contar();
      if (marcou) enviar(true);
      enviarCliques(true);
    });
  } catch (e) {}
})();
</script>
`;
}
