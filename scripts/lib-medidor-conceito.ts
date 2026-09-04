/**
 * Medidor de abertura dos conceitos, injetado pelo publicador.
 *
 * A regra que define o valor do dado: só conta depois de alguns segundos com a
 * aba de fato VISÍVEL. O varredor de link do provedor de e-mail busca a página
 * mas não fica olhando para ela, então some sozinho desse filtro. Sem isso o
 * primeiro aviso viria de um antivírus minutos depois do envio.
 *
 * Falha em silêncio de ponta a ponta: é uma página de venda, e nada aqui pode
 * aparecer para o prospect.
 */

/** Segundos de aba visível antes de considerar que alguém abriu de verdade. */
const SEGUNDOS_PARA_CONTAR = 5;

export function medidorDeVisitas({ slug, api }: { slug: string; api: string }): string {
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

    function enviar(saindo) {
      var corpo = JSON.stringify({
        slug: ${JSON.stringify(slug)},
        visitante: visitante,
        sessao: sessao,
        segundos: Math.round(visiveis),
        referencia: document.referrer || null
      });
      try {
        // sendBeacon sobrevive ao fechamento da aba; fetch normal não
        if (saindo && navigator.sendBeacon) {
          navigator.sendBeacon(${JSON.stringify(api)}, new Blob([corpo], { type: "application/json" }));
        } else {
          fetch(${JSON.stringify(api)}, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: corpo,
            keepalive: true
          });
        }
      } catch (e) {}
    }

    function contar() {
      if (document.visibilityState === "visible") visiveis += (Date.now() - ultimo) / 1000;
      ultimo = Date.now();
      if (!marcou && visiveis >= ${SEGUNDOS_PARA_CONTAR}) { marcou = true; enviar(false); }
    }

    setInterval(contar, 1000);

    document.addEventListener("visibilitychange", function () {
      contar();
      if (document.visibilityState === "hidden" && marcou) enviar(true);
    });
    window.addEventListener("pagehide", function () {
      contar();
      if (marcou) enviar(true);
    });
  } catch (e) {}
})();
</script>
`;
}
