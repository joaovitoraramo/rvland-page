/**
 * Acesso à fonte de preços (API pública de notas fiscais do Paraná) com a
 * blindagem que a instabilidade dela exige: tempo limite por requisição,
 * cópia paralela quando a primeira demora, novas tentativas com pausa e
 * desistência controlada. Sem dependência de banco: roda em rota, teste ou script.
 */
export const FONTE_BASE = "https://menorpreco.notaparana.pr.gov.br/api/v1";

const TEMPO_LIMITE = 15_000; // ms por requisição
const DISPARO_COPIA = 5_000; // sem resposta nesse tempo -> dispara uma cópia
const MAX_POR_RODADA = 3;
const PAUSAS = [1_000, 2_500, 5_000]; // entre rodadas (+ até 30%)

export class FonteIndisponivel extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "FonteIndisponivel";
  }
}

type ErroFonte = Error & { tipo?: "rede" | "tempo"; status?: number };

function valeTentarDeNovo(e: ErroFonte) {
  return e.tipo === "rede" || e.tipo === "tempo" || e.status === 429 || (e.status ?? 0) >= 500;
}

const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function buscarUmaVez(url: string, sinal: AbortSignal): Promise<unknown> {
  const controle = new AbortController();
  let estourou = false;
  const timer = setTimeout(() => {
    estourou = true;
    controle.abort();
  }, TEMPO_LIMITE);
  const repassar = () => controle.abort();
  sinal.addEventListener("abort", repassar, { once: true });
  try {
    let resp: Response;
    let texto: string;
    try {
      resp = await fetch(url, {
        headers: { Accept: "application/json, text/plain, */*" },
        signal: controle.signal,
        cache: "no-store",
      });
      texto = await resp.text();
    } catch (e) {
      const erro = new Error(estourou ? "tempo esgotado" : String(e)) as ErroFonte;
      if (sinal.aborted && !estourou) erro.name = "AbortError";
      erro.tipo = estourou ? "tempo" : "rede";
      throw erro;
    }
    if (!resp.ok) {
      const erro = new Error(`HTTP ${resp.status}: ${texto.slice(0, 160)}`) as ErroFonte;
      erro.status = resp.status;
      throw erro;
    }
    return JSON.parse(texto);
  } finally {
    clearTimeout(timer);
    sinal.removeEventListener("abort", repassar);
  }
}

/** Uma rodada: requisição + cópia paralela se demorar; vale a primeira que responder. */
function rodada(url: string): Promise<unknown> {
  return new Promise((resolver, rejeitar) => {
    const controles: AbortController[] = [];
    let emAndamento = 0;
    let acabou = false;
    let ultimoErro: ErroFonte | undefined;

    const encerrar = () => {
      acabou = true;
      clearTimeout(timerCopia);
    };
    const disparar = () => {
      const controle = new AbortController();
      controles.push(controle);
      emAndamento++;
      buscarUmaVez(url, controle.signal).then(
        (dados) => {
          if (acabou) return;
          encerrar();
          controles.forEach((c) => c !== controle && c.abort());
          resolver(dados);
        },
        (e: ErroFonte) => {
          emAndamento--;
          if (acabou) return;
          if (e.name !== "AbortError") ultimoErro = e;
          if (emAndamento === 0) {
            encerrar();
            rejeitar(ultimoErro ?? e);
            return;
          }
          if (valeTentarDeNovo(e) && controles.length < MAX_POR_RODADA) {
            setTimeout(() => !acabou && disparar(), 1_000);
          }
        }
      );
    };
    disparar();
    const timerCopia = setTimeout(() => !acabou && disparar(), DISPARO_COPIA);
  });
}

/** GET resistente: rodadas com pausa; esgotou -> FonteIndisponivel. */
export async function buscarFonte(url: string): Promise<unknown> {
  let ultimo: ErroFonte | undefined;
  for (let n = 0; n <= PAUSAS.length; n++) {
    try {
      return await rodada(url);
    } catch (e) {
      ultimo = e as ErroFonte;
      if (!valeTentarDeNovo(ultimo) || n === PAUSAS.length) break;
      await pausa(PAUSAS[n] * (1 + Math.random() * 0.3));
    }
  }
  throw new FonteIndisponivel(ultimo?.message ?? "falha desconhecida");
}
