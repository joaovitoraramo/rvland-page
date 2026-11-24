/**
 * Monta o `-ldflags` do build do agente publicado (scripts/publicar-agente.ts). Puro e sem
 * efeitos: testável sem rede e sem publicar nada.
 *
 * `hermesPk` = chave PÚBLICA Ed25519 h1 do Hermes (RVLAND_HERMES_PK; base64 de 32 bytes crus ou
 * SPKI DER) embutida em `main.hermesPK`: com ela o agente aplica o documento de licença do
 * Hermes e calcula o fp (`org.aramo.hermes.licenca-chave-fp`). Sem ela o build segue SEM o -X e
 * o agente nunca aplica documento nenhum (seguro): devolve um aviso. Valor inválido aborta, e a
 * mensagem nunca repete o valor.
 */
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function chaveHermesValida(pk: string): boolean {
  if (!BASE64.test(pk)) return false;
  const b = Buffer.from(pk, "base64");
  if (b.toString("base64") !== pk) return false;
  if (b.length === 32) return true;
  return b.length === SPKI_ED25519.length + 32 && b.subarray(0, SPKI_ED25519.length).equals(SPKI_ED25519);
}

export function montarLdflags(o: {
  versao: string;
  siteUrl: string;
  licensePub: string;
  releasePub: string;
  hermesPk?: string;
}): { ld: string; avisoHermes: string | null } {
  const flags = [
    "-s",
    "-w",
    `-X main.versao=${o.versao}`,
    `-X main.defaultEndereco=${o.siteUrl}`,
    `-X main.licensePK=${o.licensePub}`,
    `-X main.releasePK=${o.releasePub}`,
  ];
  const pk = (o.hermesPk ?? "").trim();
  if (pk === "") {
    return {
      ld: flags.join(" "),
      avisoHermes:
        "AVISO: RVLAND_HERMES_PK ausente: o agente sai SEM a chave pública Hermes (h1) e nunca aplica " +
        "documento de licença do Hermes (nem arma `obrigatoria`). Seguro, mas o modo Hermes fica inerte.",
    };
  }
  if (!chaveHermesValida(pk)) {
    throw new Error("RVLAND_HERMES_PK inválida: esperado base64 canônico de 32 bytes (Ed25519 crua) ou SPKI DER. Nada foi compilado.");
  }
  flags.push(`-X main.hermesPK=${pk}`);
  return { ld: flags.join(" "), avisoHermes: null };
}
