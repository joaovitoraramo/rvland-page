/**
 * Quem abriu o conceito, quando e de onde.
 *
 * Serve para uma decisão só, mas ela vale muito: quando cobrar o follow-up.
 * Silêncio de quem nunca abriu pede outro assunto; silêncio de quem abriu três
 * vezes pede insistência. Sem isso, os dois parecem a mesma coisa.
 */

export type TipoDispositivo = "celular" | "tablet" | "computador" | "desconhecido";

export type VisitaConceito = {
  id: string;
  slug: string;
  /** id anônimo do navegador: separa pessoas diferentes de recargas da mesma */
  visitante: string;
  /** id de um carregamento da página */
  sessao: string;
  quando: Date;
  dispositivo: TipoDispositivo;
  sistema: string | null;
  cidade: string | null;
  pais: string | null;
  referencia: string | null;
  segundos: number;
};

/**
 * Provedor de e-mail abre os links sozinho para escanear vírus, e o Yahoo (que
 * roda o att.net) faz isso. Sem esta lista o primeiro "abriu!" chegaria minutos
 * depois do envio, vindo de um antivírus, e a gente comemoraria nada.
 */
const ROBOS = [
  // varredores de link de e-mail: o falso positivo que mais importa aqui
  "yahoomailproxy",
  "googleimageproxy",
  "microsoft office",
  "outlook",
  "barracuda",
  "proofpoint",
  "mimecast",
  "symantec",
  "messagelabs",
  "safelinks",
  "skypeuripreview",
  "slackbot",
  "whatsapp",
  "telegrambot",
  "discordbot",
  "twitterbot",
  "facebookexternalhit",
  "linkedinbot",
  // buscadores e monitores
  "bot",
  "crawler",
  "spider",
  "slurp",
  "preview",
  "monitor",
  "pingdom",
  "uptime",
  "lighthouse",
  // automação e linha de comando
  "headless",
  "playwright",
  "puppeteer",
  "selenium",
  "phantomjs",
  "curl",
  "wget",
  "python-requests",
  "httpclient",
  "okhttp",
  "axios",
  "go-http",
  "java/",
  "vercel",
];

/** Robô, varredor de e-mail ou script. User agent ausente conta como robô. */
export function ehRobo(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  const ua = userAgent.toLowerCase();
  return ROBOS.some((marca) => ua.includes(marca));
}

/** Tipo de tela e sistema, a partir do user agent. */
export function dispositivoDe(userAgent: string): {
  tipo: TipoDispositivo;
  sistema: string | null;
} {
  const ua = userAgent.toLowerCase();

  // iPad antes de iPhone e de Mac: o Safari do iPad se anuncia como os dois
  if (ua.includes("ipad")) return { tipo: "tablet", sistema: "iPad" };
  if (ua.includes("iphone")) return { tipo: "celular", sistema: "iPhone" };
  if (ua.includes("android")) {
    // "mobile" ausente no Android quer dizer tablet
    const tipo: TipoDispositivo = ua.includes("mobile") ? "celular" : "tablet";
    return { tipo, sistema: "Android" };
  }
  if (ua.includes("windows")) return { tipo: "computador", sistema: "Windows" };
  if (ua.includes("mac os")) return { tipo: "computador", sistema: "Mac" };
  if (ua.includes("linux")) return { tipo: "computador", sistema: "Linux" };

  return { tipo: "desconhecido", sistema: null };
}

/** "Scottsdale, US" quando dá, só o país quando é o que tem. */
export function localDe(g: { cidade: string | null; pais: string | null }): string | null {
  if (g.cidade && g.pais) return `${g.cidade}, ${g.pais}`;
  return g.cidade ?? g.pais ?? null;
}

function tempoLegivel(segundos: number): string {
  if (segundos < 60) return `${segundos}s`;
  return `${Math.round(segundos / 60)}min`;
}

const ORDINAL = ["", "1ª", "2ª", "3ª", "4ª", "5ª"];

/** Aviso no Telegram: o suficiente para decidir o follow-up sem abrir o painel. */
export function mensagemVisita({
  visita,
  negocio,
  totalDoVisitante,
}: {
  visita: VisitaConceito;
  negocio: string;
  totalDoVisitante: number;
}): string {
  // o bot envia sem parse_mode: marcação apareceria literal na mensagem
  const titulo =
    totalDoVisitante > 1
      ? `🔥 Voltou ao conceito (${ORDINAL[totalDoVisitante] ?? `${totalDoVisitante}ª`} vez) — ${negocio}`
      : `👀 Abriram o conceito — ${negocio}`;

  const linhas = [titulo, `/c/${visita.slug}`];

  const onde = localDe(visita);
  const partes: string[] = [visita.dispositivo];
  if (visita.sistema) partes.push(visita.sistema);
  linhas.push(`de: ${partes.join(" · ")}${onde ? ` · ${onde}` : ""}`);

  if (visita.segundos > 0) linhas.push(`ficou: ${tempoLegivel(visita.segundos)}`);

  return linhas.join("\n");
}

/** Números do painel: pessoas e aberturas contam coisas diferentes. */
export function resumirVisitas(visitas: VisitaConceito[]): {
  aberturas: number;
  pessoas: number;
  ultima: VisitaConceito | null;
  segundosTotais: number;
  emCelular: number;
} {
  if (visitas.length === 0) {
    return { aberturas: 0, pessoas: 0, ultima: null, segundosTotais: 0, emCelular: 0 };
  }

  const ultima = visitas.reduce((a, b) => (a.quando >= b.quando ? a : b));

  return {
    aberturas: visitas.length,
    pessoas: new Set(visitas.map((v) => v.visitante)).size,
    ultima,
    segundosTotais: visitas.reduce((s, v) => s + v.segundos, 0),
    emCelular: visitas.filter((v) => v.dispositivo === "celular").length,
  };
}
