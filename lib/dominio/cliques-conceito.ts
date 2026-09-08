/**
 * Onde o prospect clicou dentro do conceito.
 *
 * A abertura (visitas-conceito) diz que alguém entrou; isto diz o que a pessoa
 * foi ver. Clicar em "Book a free consultation" ou abrir o chat é sinal muito
 * diferente de rolar e sair, e é o que muda o tom do follow-up.
 */

import { localDe, type VisitaConceito } from "./visitas-conceito";

export type CliqueConceito = {
  id: string;
  slug: string;
  visitante: string;
  sessao: string;
  quando: Date;
  /** o que estava escrito no que foi clicado */
  rotulo: string;
  /** onde na página: id da seção, "nav", "chat", "faixa RVLand"... */
  secao: string | null;
  /** para onde levava, quando era um link */
  destino: string | null;
};

export type ItemClique = {
  rotulo: string;
  secao: string | null;
  destino: string | null;
};

export const ROTULO_MAXIMO = 80;
export const SECAO_MAXIMA = 60;
export const DESTINO_MAXIMO = 300;
export const ITENS_POR_LOTE = 30;

function compactar(texto: string, maximo: number): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > maximo ? `${limpo.slice(0, maximo - 1)}…` : limpo;
}

/** Normaliza o que veio do navegador; descarta o que não tem rótulo. */
export function limparItens(itens: ItemClique[]): ItemClique[] {
  return itens
    .map((i) => ({
      rotulo: compactar(i.rotulo ?? "", ROTULO_MAXIMO),
      secao: i.secao ? compactar(i.secao, SECAO_MAXIMA) : null,
      destino: i.destino ? compactar(i.destino, DESTINO_MAXIMO) : null,
    }))
    .filter((i) => i.rotulo.length > 0)
    .slice(0, ITENS_POR_LOTE);
}

/** Domínio de um link externo, ou null para âncora, telefone, e-mail e relativo. */
export function dominioDoDestino(destino: string | null): string | null {
  if (!destino) return null;
  try {
    const url = new URL(destino);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Uma linha por clique: rótulo, onde e para onde. */
export function linhaDoClique(item: ItemClique, conceitoHost?: string): string {
  const partes = [`• ${item.rotulo}`];
  const dominio = dominioDoDestino(item.destino);
  if (item.destino?.startsWith("tel:")) partes.push("(ligar)");
  else if (item.destino?.startsWith("mailto:")) partes.push("(e-mail)");
  else if (dominio && dominio !== conceitoHost) partes.push(`→ ${dominio}`);
  if (item.secao) partes.push(`[${item.secao}]`);
  return partes.join(" ");
}

/**
 * Aviso no Telegram: um lote de cliques da mesma sessão vira uma mensagem só.
 * Trinta mensagens para uma pessoa explorando o site seriam ruído; uma lista
 * na ordem em que aconteceu é o que dá para ler no celular.
 */
export function mensagemCliques({
  negocio,
  slug,
  itens,
  visita,
  totalNaSessao,
  conceitoHost,
}: {
  negocio: string;
  slug: string;
  itens: ItemClique[];
  visita: Pick<VisitaConceito, "dispositivo" | "sistema" | "cidade" | "pais"> | null;
  /** cliques desta sessão já contando estes */
  totalNaSessao: number;
  conceitoHost?: string;
}): string {
  // o bot envia sem parse_mode: marcação apareceria literal na mensagem
  const titulo =
    itens.length === 1
      ? `🖱 Clicou no conceito — ${negocio}`
      : `🖱 Navegou no conceito (${itens.length} cliques) — ${negocio}`;
  const linhas = [titulo, `/c/${slug}`, ...itens.map((i) => linhaDoClique(i, conceitoHost))];

  if (visita) {
    const onde = localDe(visita);
    const partes: string[] = [visita.dispositivo];
    if (visita.sistema) partes.push(visita.sistema);
    linhas.push(`de: ${partes.join(" · ")}${onde ? ` · ${onde}` : ""}`);
  }
  if (totalNaSessao > itens.length) linhas.push(`nesta visita: ${totalNaSessao} cliques no total`);

  return linhas.join("\n");
}

export type SessaoComCliques = {
  sessao: string;
  visitante: string;
  primeiro: Date;
  ultimo: Date;
  cliques: CliqueConceito[];
};

/** Agrupa por sessão, da mais recente para a mais antiga, para o painel. */
export function agruparPorSessao(cliques: CliqueConceito[]): SessaoComCliques[] {
  const mapa = new Map<string, SessaoComCliques>();
  for (const c of cliques) {
    const s = mapa.get(c.sessao);
    if (!s) {
      mapa.set(c.sessao, {
        sessao: c.sessao,
        visitante: c.visitante,
        primeiro: c.quando,
        ultimo: c.quando,
        cliques: [c],
      });
      continue;
    }
    s.cliques.push(c);
    if (c.quando < s.primeiro) s.primeiro = c.quando;
    if (c.quando > s.ultimo) s.ultimo = c.quando;
  }
  const sessoes = [...mapa.values()];
  for (const s of sessoes) s.cliques.sort((a, b) => a.quando.getTime() - b.quando.getTime());
  return sessoes.sort((a, b) => b.ultimo.getTime() - a.ultimo.getTime());
}

/** O que mais chamou atenção: rótulos mais clicados, contando pessoas diferentes. */
export function maisClicados(
  cliques: CliqueConceito[],
  limite = 5
): { rotulo: string; vezes: number; pessoas: number }[] {
  const mapa = new Map<string, { vezes: number; pessoas: Set<string> }>();
  for (const c of cliques) {
    const chave = c.rotulo.toLowerCase();
    const atual = mapa.get(chave) ?? { vezes: 0, pessoas: new Set<string>() };
    atual.vezes += 1;
    atual.pessoas.add(c.visitante);
    mapa.set(chave, atual);
  }
  const rotuloOriginal = new Map<string, string>();
  for (const c of cliques) if (!rotuloOriginal.has(c.rotulo.toLowerCase())) rotuloOriginal.set(c.rotulo.toLowerCase(), c.rotulo);
  return [...mapa.entries()]
    .map(([chave, v]) => ({ rotulo: rotuloOriginal.get(chave) ?? chave, vezes: v.vezes, pessoas: v.pessoas.size }))
    .sort((a, b) => b.vezes - a.vezes || a.rotulo.localeCompare(b.rotulo))
    .slice(0, limite);
}
