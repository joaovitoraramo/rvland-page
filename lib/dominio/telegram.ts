import { formatarDataHoraBR, reaisParaCentavos, formatarReais } from "@/lib/formato";
import { formatarCompetenciaBR, formatarDataBR } from "@/lib/dominio/tempo";
import { STATUS_LEAD, type StatusLead } from "@/lib/dominio/leads";

/**
 * Domínio puro do bot do Telegram: parsers dos comandos, distribuição de
 * pagamento entre faturas e os textos das mensagens. Nada de IO aqui.
 */

export type ComandoFatura = { idCurto: string; valorCentavos: number; pagoEm: string | null };

const ID_RE = /^[0-9a-f][0-9a-f-]{7,35}$/;
const DATA_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export const AJUDA_BOT = [
  "Comandos disponíveis:",
  "/clientes — lista clientes, ids e faturas em aberto",
  "/leads — funil de leads com ids",
  "/lead <id> — mostra mensagem e notas do lead",
  "/lead <id> <status> [nota] — atualiza (status: novo, em_conversa, proposta, ganho, perdido)",
  "/fatura <id> <valor> [data]",
  "Ex.: /fatura a1b2c3d4 2.490,40 29/08/2026",
  "O id do cliente aparece nos avisos de licença. Sem data = hoje.",
].join("\n");

export function parseComandoFatura(
  texto: string
): { ok: true; comando: ComandoFatura } | { ok: false; erro: string } {
  const partes = texto.trim().split(/\s+/);
  const [comando, id, valor, data, ...resto] = partes;

  if (!comando?.replace(/@\S+$/, "").match(/^\/fatura$/) || !id || !valor || resto.length > 0) {
    return { ok: false, erro: `Não entendi. ${AJUDA_BOT}` };
  }

  const idCurto = id.toLowerCase();
  if (!ID_RE.test(idCurto)) {
    return {
      ok: false,
      erro: "Id inválido — use pelo menos os 8 primeiros caracteres do id do cliente (aparece nos avisos de licença).",
    };
  }

  const valorCentavos = reaisParaCentavos(valor);
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) {
    return { ok: false, erro: "Valor inválido. Use o formato 2.490,40 (ou 2490,40)." };
  }

  let pagoEm: string | null = null;
  if (data) {
    const m = data.match(DATA_RE);
    if (!m) return { ok: false, erro: "Data inválida. Use DD/MM/AAAA, ex.: 29/08/2026." };
    const [, dd, mm, aaaa] = m;
    const dia = Number(dd);
    const mes = Number(mm);
    const diasNoMes = new Date(Number(aaaa), mes, 0).getDate();
    if (mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes) {
      return { ok: false, erro: "Data inválida. Use DD/MM/AAAA, ex.: 29/08/2026." };
    }
    pagoEm = `${aaaa}-${mm}-${dd}`;
  }

  return { ok: true, comando: { idCurto, valorCentavos, pagoEm } };
}

export type FaturaEmAberto = {
  id: string;
  competencia: string;
  vencimento: string;
  valorCentavos: number;
  pagoCentavos: number;
};

export type Alocacao = {
  faturaId: string;
  competencia: string;
  valorCentavos: number;
  quita: boolean;
};

/** Distribui o valor da mais antiga (vencimento) para a mais nova. */
export function distribuirPagamento(
  faturas: FaturaEmAberto[],
  valorCentavos: number
): { alocacoes: Alocacao[]; sobraCentavos: number } {
  const ordenadas = [...faturas].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const alocacoes: Alocacao[] = [];
  let restante = valorCentavos;

  for (const f of ordenadas) {
    if (restante <= 0) break;
    const falta = f.valorCentavos - f.pagoCentavos;
    if (falta <= 0) continue;
    const aloca = Math.min(falta, restante);
    alocacoes.push({
      faturaId: f.id,
      competencia: f.competencia,
      valorCentavos: aloca,
      quita: aloca === falta,
    });
    restante -= aloca;
  }

  return { alocacoes, sobraCentavos: restante };
}

export function mensagemLead(lead: {
  origem: "br" | "en";
  nome: string;
  negocio?: string | null;
  canal: string;
  contato: string;
  mensagem: string;
}): string {
  const origem = lead.origem === "en" ? "EN" : "BR";
  const titulo = lead.negocio ? `🆕 Lead ${origem} — ${lead.negocio}` : `🆕 Lead ${origem}`;
  const corpo =
    lead.mensagem.length > 300 ? `${lead.mensagem.slice(0, 300)}…` : lead.mensagem;
  return [titulo, `${lead.nome} · ${lead.canal}: ${lead.contato}`, `«${corpo}»`].join("\n");
}

const ROTULO_STATUS: Record<string, string> = {
  em_dia: "em dia",
  atrasado: "atrasado",
  bloqueado: "bloqueado",
  cancelado: "cancelado",
  sem_licenca: "sem licença",
};

export function mensagemLicenca(aviso: {
  nome: string;
  idCurto: string;
  novo: "atrasado" | "bloqueado" | "em_dia";
  venceEm: string | null;
  toleradoAte: string | null;
}): string {
  const linhas: string[] = [];

  if (aviso.novo === "atrasado") {
    linhas.push(`⚠️ ${aviso.nome} (id ${aviso.idCurto}) ficou ATRASADO.`);
    if (aviso.venceEm) linhas.push(`Venceu em ${formatarDataBR(aviso.venceEm)}.`);
    if (aviso.toleradoAte) linhas.push(`Tolera até ${formatarDataBR(aviso.toleradoAte)}.`);
    linhas.push(`Registrar pagamento: /fatura ${aviso.idCurto} <valor>`);
  } else if (aviso.novo === "bloqueado") {
    linhas.push(`⛔ ${aviso.nome} (id ${aviso.idCurto}) foi BLOQUEADO.`);
    if (aviso.toleradoAte) linhas.push(`Tolerância venceu em ${formatarDataBR(aviso.toleradoAte)}.`);
    linhas.push(`Registrar pagamento: /fatura ${aviso.idCurto} <valor>`);
  } else {
    linhas.push(`✅ ${aviso.nome} (id ${aviso.idCurto}) voltou a ficar EM DIA.`);
    if (aviso.venceEm) linhas.push(`Próximo vencimento: ${formatarDataBR(aviso.venceEm)}.`);
  }

  return linhas.join("\n");
}

export function respostaFatura(r: {
  clienteNome: string;
  alocacoes: Alocacao[];
  sobraCentavos: number;
  licenca: { status: string; venceEm: string | null; toleradoAte: string | null };
}): string {
  const linhas = [`${r.clienteNome}:`];

  for (const a of r.alocacoes) {
    linhas.push(
      `${a.quita ? "✅" : "▫️"} ${formatarCompetenciaBR(a.competencia)}: ${formatarReais(
        a.valorCentavos
      )} ${a.quita ? "(quitada)" : "(parcial — fatura segue aberta)"}`
    );
  }

  if (r.sobraCentavos > 0) {
    linhas.push(`↩️ Sobra não registrada: ${formatarReais(r.sobraCentavos)}.`);
  }

  const rotulo = ROTULO_STATUS[r.licenca.status] ?? r.licenca.status;
  let licenca = `Licença: ${rotulo}`;
  if (r.licenca.status === "em_dia" && r.licenca.venceEm) {
    licenca += ` — próximo vencimento ${formatarDataBR(r.licenca.venceEm)}`;
  } else if (r.licenca.toleradoAte) {
    licenca += ` — tolerado até ${formatarDataBR(r.licenca.toleradoAte)}`;
  }
  linhas.push(licenca);

  return linhas.join("\n");
}

export type ClienteResumo = {
  id: string;
  nome: string;
  licenca: string;
  faturas: { id: string; competencia: string; valorCentavos: number; vencimento: string }[];
};

const LIMITE_CHUNK = 3500; // margem sob os 4096 do Telegram

/** Lista de clientes do /clientes, quebrada em mensagens sob o limite. */
export function mensagemClientes(clientes: ClienteResumo[]): string[] {
  if (clientes.length === 0) return ["Nenhum cliente ativo."];

  const blocos = clientes.map((c) => {
    const linhas = [
      `▪️ ${c.nome} — ${ROTULO_STATUS[c.licenca] ?? c.licenca}`,
      `id: ${c.id}`,
    ];
    if (c.faturas.length === 0) {
      linhas.push("(sem faturas em aberto)");
    } else {
      for (const f of c.faturas) {
        linhas.push(
          `• ${formatarCompetenciaBR(f.competencia)} · ${formatarReais(
            f.valorCentavos
          )} · vence ${formatarDataBR(f.vencimento)}`
        );
        linhas.push(`  fatura: ${f.id}`);
      }
    }
    return linhas.join("\n");
  });

  const chunks: string[] = [];
  let atual = `👥 Clientes ativos (${clientes.length})`;
  for (const bloco of blocos) {
    if (atual.length + bloco.length + 2 > LIMITE_CHUNK) {
      chunks.push(atual);
      atual = bloco;
    } else {
      atual = `${atual}\n\n${bloco}`;
    }
  }
  chunks.push(atual);
  return chunks;
}

export const rotuloStatusLead: Record<StatusLead, string> = {
  novo: "Novo",
  em_conversa: "Em conversa",
  proposta: "Proposta",
  ganho: "Ganho",
  perdido: "Perdido",
};

export type ComandoLead = { idCurto: string; status: StatusLead | null; nota: string | null };

export function parseComandoLead(
  texto: string
): { ok: true; comando: ComandoLead } | { ok: false; erro: string } {
  const m = texto.trim().match(/^\/lead(?:@\S+)?\s+(\S+)(?:\s+(\S+)([\s\S]*))?$/);
  if (!m) {
    return {
      ok: false,
      erro: "Não entendi. Use: /lead <id> [status] [nota] — só o id mostra o lead.",
    };
  }

  const idCurto = m[1].toLowerCase();
  if (!ID_RE.test(idCurto)) {
    return {
      ok: false,
      erro: "Id inválido — use pelo menos os 8 primeiros caracteres do id do lead (veja /leads).",
    };
  }

  // Só o id: consulta — devolve os dados do lead sem alterar nada.
  if (!m[2]) return { ok: true, comando: { idCurto, status: null, nota: null } };

  const status = m[2].toLowerCase();
  if (!(STATUS_LEAD as readonly string[]).includes(status)) {
    return { ok: false, erro: `Status inválido. Use um de: ${STATUS_LEAD.join(", ")}.` };
  }

  const nota = (m[3] ?? "").trim();
  return { ok: true, comando: { idCurto, status: status as StatusLead, nota: nota || null } };
}

/** Nota do Telegram SEMPRE acrescenta às existentes, com carimbo — nunca substitui. */
export function concatenarNota(atuais: string | null, nota: string, dataBR: string): string {
  const entrada = `[${dataBR} · telegram] ${nota.trim()}`;
  return atuais && atuais.trim() ? `${atuais.trimEnd()}\n\n${entrada}` : entrada;
}

export type LeadResumo = {
  id: string;
  nome: string;
  negocio: string | null;
  origem: "br" | "en";
  canal: string;
  contato: string;
  status: StatusLead;
  criadoEm: Date;
};

/** Funil vivo do /leads, quebrado em mensagens sob o limite do Telegram. */
export function mensagemLeads(leads: LeadResumo[]): string[] {
  if (leads.length === 0) return ["Nenhum lead em aberto."];

  const blocos = leads.map((l) => {
    const titulo = l.negocio
      ? `▪️ ${l.nome} — ${l.negocio} (${l.origem.toUpperCase()})`
      : `▪️ ${l.nome} (${l.origem.toUpperCase()})`;
    return [
      titulo,
      `${rotuloStatusLead[l.status]} · ${l.canal}: ${l.contato} · ${formatarDataHoraBR(l.criadoEm)}`,
      `id: ${l.id.slice(0, 8)}`,
    ].join("\n");
  });

  const chunks: string[] = [];
  let atual = `📋 Leads em aberto (${leads.length})`;
  for (const bloco of blocos) {
    if (atual.length + bloco.length + 2 > LIMITE_CHUNK) {
      chunks.push(atual);
      atual = bloco;
    } else {
      atual = `${atual}\n\n${bloco}`;
    }
  }
  atual += `\n\nAtualizar: /lead <id> <status> [nota]\nStatus: ${STATUS_LEAD.join(" · ")}`;
  chunks.push(atual);
  return chunks;
}

/** Junta blocos em mensagens sob o limite; bloco gigante é fatiado na marra. */
function empacotar(blocos: string[]): string[] {
  const normalizados = blocos.flatMap((b) => {
    if (b.length <= LIMITE_CHUNK) return [b];
    const partes: string[] = [];
    for (let i = 0; i < b.length; i += LIMITE_CHUNK) partes.push(b.slice(i, i + LIMITE_CHUNK));
    return partes;
  });

  const chunks: string[] = [];
  let atual = "";
  for (const bloco of normalizados) {
    if (atual && atual.length + bloco.length + 2 > LIMITE_CHUNK) {
      chunks.push(atual);
      atual = bloco;
    } else {
      atual = atual ? `${atual}\n\n${bloco}` : bloco;
    }
  }
  if (atual) chunks.push(atual);
  return chunks;
}

/** Consulta do /lead <id>: cabeçalho, mensagem original e notas completas. */
export function detalheLead(l: {
  id: string;
  nome: string;
  negocio: string | null;
  origem: "br" | "en";
  canal: string;
  contato: string;
  status: StatusLead;
  criadoEm: Date;
  mensagem: string;
  notas: string | null;
}): string[] {
  const titulo = l.negocio
    ? `▪️ ${l.nome} — ${l.negocio} (${l.origem.toUpperCase()})`
    : `▪️ ${l.nome} (${l.origem.toUpperCase()})`;

  const cabecalho = [
    titulo,
    `Status: ${rotuloStatusLead[l.status]} · ${l.canal}: ${l.contato}`,
    `Chegou: ${formatarDataHoraBR(l.criadoEm)}`,
    `id: ${l.id.slice(0, 8)}`,
  ].join("\n");

  const mensagem = `📩 Mensagem:\n«${l.mensagem}»`;
  const notas = `📝 Notas:\n${l.notas?.trim() ? l.notas : "— sem notas —"}`;
  const rodape = "Atualizar: /lead <id> <status> [nota]";

  return empacotar([cabecalho, mensagem, notas, rodape]);
}
