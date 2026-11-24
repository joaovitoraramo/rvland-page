import { avaliarClone, lerControle, registrarReplay, type ControleClone, type SuspeitaClone } from "@/lib/hermes/clone";
import { esquemaSync, TIPOS_EVENTO_AGENTE, type CorpoSync } from "@/lib/hermes/protocolo";
import type { DocumentoHermes } from "@/lib/hermes/documento";
import type { EnvelopeHermes } from "@/lib/crypto/hermes";
import { autenticarAgenteHermes, type DepsAuthAgente, type EntradaAgente } from "./hermes-agente-auth";
import { derivarDocumento, type DepsLicenca } from "./hermes-licenca-instalacao";
import type { RespostaHttp } from "./hermes-http";
import type { DepsEfeitos, EventoNovo, InstalacaoHermes, PatchInstalacao } from "./hermes-tipos";

export const INTERVALO_SEG = 60;
const MAX_DADOS_EVENTO_BYTES = 2000;

export interface DepsSync extends DepsAuthAgente, DepsLicenca, DepsEfeitos {
  /**
   * Anti-replay ATÔMICO: `UPDATE ... SET ultimo_ts_agente=$ts WHERE id=$id AND
   * (ultimo_ts_agente IS NULL OR ultimo_ts_agente < $ts)`; false = nenhuma linha.
   */
  avancarTimestamp(instalacaoId: string, ts: Date): Promise<boolean>;
  gravarInstalacao(instalacaoId: string, patch: PatchInstalacao): Promise<void>;
  /**
   * Promoção CONDICIONAL: `UPDATE ... SET status='ativa', ativada_em=$agora WHERE id=$id
   * AND status='aguardando_ativacao'`; true = alguma linha mudou. Separada do patch de
   * estado para uma revogação concorrente (entre a leitura e a gravação) nunca ser desfeita.
   */
  ativarSeAguardando(instalacaoId: string, agora: Date): Promise<boolean>;
  /**
   * Grava SÓ `saude._controle` (merge de chave única: `jsonb_set`), sem sobrescrever o resto
   * de `saude`; usado quando o sync é recusado (REPLAY) e não há patch de estado.
   */
  gravarControleClone(instalacaoId: string, controle: ControleClone): Promise<void>;
  inserirEventos(servidorId: string, eventos: EventoNovo[]): Promise<void>;
  /** Assina com RVLAND_HERMES_SK; lança se a chave não está disponível. */
  assinar(doc: DocumentoHermes): EnvelopeHermes;
}

const permitidos = new Set<string>(TIPOS_EVENTO_AGENTE);

function eventosDoAgente(c: CorpoSync): EventoNovo[] {
  return (c.eventos ?? [])
    .filter((e) => permitidos.has(e.tipo))
    .map((e) => {
      const tamanho = e.dados ? Buffer.byteLength(JSON.stringify(e.dados), "utf8") : 0;
      return {
        tipo: e.tipo,
        severidade: e.severidade ?? "info",
        mensagem: e.mensagem.slice(0, 300),
        dados: e.dados && tamanho <= MAX_DADOS_EVENTO_BYTES ? e.dados : null,
      };
    });
}

/** Alerta de clone (só alerta; o dono decide pelo painel). `novo` = ainda não havia alerta aberto. */
async function alertarClone(
  instalacao: InstalacaoHermes,
  servidorId: string,
  motivo: Exclude<SuspeitaClone, null>,
  deps: DepsEfeitos
): Promise<void> {
  await deps.auditar({
    acao: "hermes.clone_suspeito",
    entidadeId: instalacao.id,
    detalhes: { servidor_id: servidorId, motivo },
  });
  await deps.telegram(
    `Hermes: possível CLONE de instalação em "${instalacao.nome}" (${instalacao.id.slice(0, 8)}). ` +
      `Sinal: ${motivo}. Nada foi bloqueado; avalie no painel (bloqueio manual com motivo) e fale com o cliente.`
  );
}

/**
 * REPLAY de requisição JÁ autenticada: conta no controle de clone (só alerta,
 * a resposta continua sendo o 409). Falha aqui nunca muda a resposta.
 */
async function tratarReplay(
  instalacao: InstalacaoHermes,
  servidorId: string,
  agora: Date,
  deps: DepsSync
): Promise<RespostaHttp> {
  try {
    const r = registrarReplay(lerControle(instalacao.saude), agora.getTime());
    await deps.gravarControleClone(instalacao.id, r.controle);
    if (r.suspeito && !instalacao.cloneSuspeitoEm) {
      await deps.gravarInstalacao(instalacao.id, { cloneSuspeitoEm: agora });
      await deps.inserirEventos(servidorId, [
        {
          tipo: "hermes_clone_suspeito",
          severidade: "critico",
          mensagem: `Possível clone de instalação (${r.suspeito}).`,
          dados: { motivo: r.suspeito },
        },
      ]);
      await alertarClone(instalacao, servidorId, r.suspeito, deps);
    }
  } catch {
    console.error("[hermes] não foi possível registrar o sinal de replay");
  }
  return { status: 409, corpo: { erro: "REPLAY" } };
}

/**
 * POST /api/agente/hermes — canal paralelo de licença do Hermes. NÃO toca o
 * heartbeat/lease do Credit e do Pic Price: rota, tabela e chave próprias.
 *
 * Ordem: autenticação (401) → relógio (409 RELOGIO) → instalação (404) →
 * validação do corpo (400/422) → anti-replay atômico (409 REPLAY) → estado,
 * clone, eventos → documento assinado.
 *
 * Auditoria: só mudanças relevantes (ativação, clone suspeito). O ciclo de
 * 60 s não audita a cada chamada (inundaria a trilha); o estado fica na
 * instalação e nos eventos.
 */
export async function tratarSyncHermes(e: EntradaAgente, deps: DepsSync): Promise<RespostaHttp> {
  const auth = await autenticarAgenteHermes(e, "sync", deps);
  if (!auth.ok) return auth.resposta;
  const { servidor, instalacao, agora, tsAgente } = auth;

  let bruto: unknown;
  try {
    bruto = JSON.parse(e.rawBody || "{}");
  } catch {
    return { status: 400, corpo: { erro: "JSON_INVALIDO" } };
  }
  const parsed = esquemaSync.safeParse(bruto);
  if (!parsed.success) {
    return { status: 422, corpo: { erro: "CORPO_INVALIDO", campos: parsed.error.issues.slice(0, 5).map((i) => i.path.join(".")) } };
  }
  const corpo = parsed.data;

  // anti-replay: barato primeiro, atômico depois (cobre requisições simultâneas)
  if (instalacao.ultimoTsAgente && tsAgente.getTime() <= instalacao.ultimoTsAgente.getTime()) {
    return tratarReplay(instalacao, servidor.id, agora, deps);
  }
  if (!(await deps.avancarTimestamp(instalacao.id, tsAgente))) {
    return tratarReplay(instalacao, servidor.id, agora, deps);
  }

  const eventos = eventosDoAgente(corpo);

  // relógio: um evento só na transição confiável -> não confiável
  const relogioConfiavel = corpo.relogio?.confiavel;
  if (relogioConfiavel === false && instalacao.saude?.relogio_confiavel !== false) {
    eventos.push({
      tipo: "hermes_relogio",
      severidade: "aviso",
      mensagem: "O agente reportou relógio do servidor não confiável.",
      dados: null,
    });
  }

  // clone suspeito (só alerta; o dono decide pelo painel)
  const clone = avaliarClone(lerControle(instalacao.saude), corpo.fingerprint.boot_id, agora.getTime(), corpo.fingerprint.machine_id_hash);
  const novoClone = clone.suspeito !== null && !instalacao.cloneSuspeitoEm;
  if (novoClone) {
    eventos.push({
      tipo: "hermes_clone_suspeito",
      severidade: "critico",
      mensagem: `Possível clone de instalação (${clone.suspeito}).`,
      dados: { motivo: clone.suspeito },
    });
  }

  // documento de licença (derivado antes de gravar: se não der para assinar, 503, mas o estado fica salvo)
  const { documento } = await derivarDocumento(instalacao, agora, deps);
  let envelope: EnvelopeHermes | null = null;
  try {
    envelope = deps.assinar(documento);
  } catch {
    // sem detalhe (nem no log): o erro pode citar nomes de variáveis de ambiente
    console.error("[hermes] documento de licença não pôde ser assinado");
  }

  const c = corpo.container;
  const ativando = instalacao.status === "aguardando_ativacao";
  const patch: PatchInstalacao = {
    versao: c.versao ?? null,
    sha: c.sha ?? null,
    digest: c.digest ?? null,
    canalEmUso: c.canal_em_uso ?? null,
    fingerprint: { ...corpo.fingerprint },
    saude: {
      container: c.estado,
      saude: c.saude ?? "desconhecida",
      iniciado_em: c.iniciado_em ?? null,
      agente_versao: corpo.agente_versao ?? null,
      relogio_confiavel: relogioConfiavel ?? null,
      doc_agente_emitido_em: corpo.ultimo_emitido_em ?? null,
      _controle: clone.controle,
    },
    relogioOffsetMs: agora.getTime() - tsAgente.getTime(),
    ultimoEstadoEm: agora,
    ...(novoClone ? { cloneSuspeitoEm: agora } : {}),
    ...(envelope ? { ultimoDocEmitidoEm: agora } : {}),
  };
  await deps.gravarInstalacao(instalacao.id, patch);
  if (eventos.length) await deps.inserirEventos(servidor.id, eventos);

  // só audita se ESTE sync de fato promoveu (revogada/desinstalada no meio do caminho não vira ativa)
  if (ativando && (await deps.ativarSeAguardando(instalacao.id, agora))) {
    await deps.auditar({
      acao: "hermes.instalacao_ativada",
      entidadeId: instalacao.id,
      detalhes: { servidor_id: servidor.id, versao: c.versao ?? null, canal_em_uso: c.canal_em_uso ?? null },
    });
  }
  if (novoClone && clone.suspeito) await alertarClone(instalacao, servidor.id, clone.suspeito, deps);

  if (!envelope) return { status: 503, corpo: { erro: "INDISPONIVEL" } };

  return {
    status: 200,
    corpo: {
      licenca: envelope,
      agora: agora.toISOString(),
      intervalo_seg: INTERVALO_SEG,
      canal: instalacao.canal,
      // reservado: preenchido no passo de atualização dirigida pelo RV
      digest_alvo: null,
    },
  };
}
