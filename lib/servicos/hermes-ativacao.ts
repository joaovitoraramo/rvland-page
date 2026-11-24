import { verificarHeartbeat } from "@/lib/crypto/heartbeat-auth";
import { formatoChaveValido, hashChaveHermes } from "@/lib/hermes/chave";
import { cnpjsMesmaRaiz, cnpjValido, mascararCnpjRaiz, raizCnpj, soDigitosCnpj } from "@/lib/hermes/cnpj";
import { esquemaAtivacao, esquemaValidar, sanitizarIdentificacao } from "@/lib/hermes/protocolo";
import { chaveDeIp, type RespostaHttp } from "./hermes-http";
import { excedeuLimite, registrarOcorrencia, UMA_HORA_MS } from "./hermes-limite";
import { nomeDaIdentificacao, registrarSolicitacao, textoSeguro, type DepsSolicitacao } from "./hermes-solicitacao";
import type { ChaveHermes, RepoAtivacao, UsoChave } from "./hermes-ativacao-tipos";

export const MAX_FALHAS_POR_HORA_IP = 10;
export const REENTRADA_MS = 30 * 60_000;

export interface DepsAtivacao extends DepsSolicitacao {
  repo: RepoAtivacao;
  /** `gerarTokenParaServidor` (lib/servicos/enrollment.ts), sem alteração. */
  gerarTokenEnroll(servidorId: string): Promise<string>;
}

/** MESMA resposta para chave inexistente, expirada, usada, revogada, malformada ou prova ruim. */
const CHAVE_INVALIDA: RespostaHttp = { status: 401, corpo: { erro: "CHAVE_INVALIDA" } };
const LIMITE: RespostaHttp = { status: 429, corpo: { erro: "LIMITE" }, headers: { "retry-after": "3600" } };
const chaveFalhas = (ip: string) => chaveDeIp("ativfalha", ip);

async function falhar(ip: string, deps: DepsAtivacao): Promise<RespostaHttp> {
  await registrarOcorrencia(deps.limites, chaveFalhas(ip), UMA_HORA_MS, deps.agora());
  return CHAVE_INVALIDA;
}

function utilizavel(c: ChaveHermes | null, agora: Date): c is ChaveHermes {
  return !!c && !c.usadaEm && !c.revogadaEm && c.expiraEm.getTime() > agora.getTime();
}

/** Mesma chave + mesma máquina, em até 30 min do uso: o instalador pode repetir (queda de rede, retry). */
function reentrada(c: ChaveHermes | null, machineId: string | undefined, agora: Date): c is ChaveHermes {
  return (
    !!c &&
    !!c.usadaEm &&
    !c.revogadaEm &&
    !!c.resultadoInstalacaoId &&
    !!machineId &&
    c.usadaFingerprint?.machine_id_hash === machineId &&
    agora.getTime() - c.usadaEm.getTime() <= REENTRADA_MS
  );
}

type Preparo =
  | { ok: false; resposta: RespostaHttp }
  | { ok: true; chave: ChaveHermes; hash: string; cnpj: string; livre: boolean };

/**
 * Passos comuns de validar/ativar, SEM consumir: limite de falhas, CNPJ,
 * chave (utilizável ou reentrada) e conferência da RAIZ do CNPJ.
 */
async function preparar(
  e: { chave: string; cnpj: string; fingerprint?: { machine_id_hash?: string }; identificacao?: unknown; origem?: string | null; versaoInstalador?: string | null; ip: string },
  deps: DepsAtivacao
): Promise<Preparo> {
  const agora = deps.agora();
  if (await excedeuLimite(deps.limites, chaveFalhas(e.ip), MAX_FALHAS_POR_HORA_IP, UMA_HORA_MS, agora)) {
    return { ok: false, resposta: LIMITE };
  }
  if (!cnpjValido(e.cnpj)) return { ok: false, resposta: { status: 422, corpo: { erro: "CNPJ_INVALIDO" } } };
  const cnpj = soDigitosCnpj(e.cnpj);

  if (!formatoChaveValido(e.chave)) return { ok: false, resposta: await falhar(e.ip, deps) };
  const hash = hashChaveHermes(e.chave);
  const chave = await deps.repo.chavePorHash(hash);
  const livre = utilizavel(chave, agora);
  if (!livre && !reentrada(chave, e.fingerprint?.machine_id_hash, agora)) {
    return { ok: false, resposta: await falhar(e.ip, deps) };
  }
  const c = chave as ChaveHermes;

  // CNPJ: compara a RAIZ (matriz e filiais) com o da chave (ou, sem snapshot, o do cliente)
  const referencia = c.cnpj ?? (await deps.repo.clienteBasico(c.clienteId))?.cnpj ?? null;
  const temReferencia = soDigitosCnpj(referencia).length >= 8;
  if (!temReferencia) {
    // sem referência não há como conferir a raiz: aceita (não trava a instalação), mas deixa rastro 'suspeita'
    await registrarSolicitacao(
      {
        cnpj,
        cnpjRaiz: raizCnpj(cnpj),
        identificacao: sanitizarIdentificacao(e.identificacao),
        fingerprint: e.fingerprint ?? {},
        origemIdentificacao: e.origem ?? null,
        ipOrigem: e.ip === "desconhecido" ? null : e.ip,
        versaoInstalador: e.versaoInstalador ?? null,
        status: "suspeita",
        motivo: `Chave ${c.prefixo}… sem CNPJ de referência (sem snapshot e cliente sem documento); CNPJ informado não conferido`,
      },
      deps,
      {
        auditoria: "hermes.cnpj_sem_referencia",
        avisoTipo: "semref",
        texto: (protocolo) =>
          `Hermes: chave ${textoSeguro(c.prefixo, 8)}… usada SEM CNPJ de referência para conferir ` +
          `(informado ${cnpj}). Aceita, marcada como suspeita no protocolo ${protocolo}; confira o cliente.`,
      }
    );
  }
  if (temReferencia && !cnpjsMesmaRaiz(referencia, cnpj)) {
    await registrarSolicitacao(
      {
        cnpj,
        cnpjRaiz: raizCnpj(cnpj),
        identificacao: sanitizarIdentificacao(e.identificacao),
        fingerprint: e.fingerprint ?? {},
        origemIdentificacao: e.origem ?? null,
        ipOrigem: e.ip === "desconhecido" ? null : e.ip,
        versaoInstalador: e.versaoInstalador ?? null,
        status: "suspeita",
        motivo: `Chave ${c.prefixo}… emitida para outra raiz de CNPJ`,
      },
      deps,
      {
        auditoria: "hermes.cnpj_divergente",
        avisoTipo: "div",
        texto: (protocolo) =>
          `Hermes: CNPJ DIVERGENTE ao usar a chave ${textoSeguro(c.prefixo, 8)}… ` +
          `(informado ${cnpj}, raiz diferente da chave). Protocolo ${protocolo}, marcada como suspeita.`,
      }
    );
    await registrarOcorrencia(deps.limites, chaveFalhas(e.ip), UMA_HORA_MS, agora);
    return { ok: false, resposta: { status: 409, corpo: { erro: "CNPJ_DIVERGENTE" } } };
  }
  return { ok: true, chave: c, hash, cnpj, livre };
}

function lerJson(corpo: string): { ok: true; valor: unknown } | { ok: false; resposta: RespostaHttp } {
  try {
    return { ok: true, valor: JSON.parse(corpo || "{}") };
  } catch {
    return { ok: false, resposta: { status: 400, corpo: { erro: "JSON_INVALIDO" } } };
  }
}

type InstalacaoResultado = NonNullable<Awaited<ReturnType<RepoAtivacao["instalacaoDoResultado"]>>>;

/**
 * Reentrada da instalação nova: emite um token de enroll NOVO (o anterior é
 * substituído) e AUDITA (`hermes.chave_reentrada`: prefixo da chave, instalação
 * e servidor; NUNCA o token nem a chave). Chamar só com `servidorId` e servidor `pendente`.
 */
async function reemitirEnroll(chave: ChaveHermes, r: InstalacaoResultado & { servidorId: string }, deps: DepsAtivacao): Promise<RespostaHttp> {
  const token = await deps.gerarTokenEnroll(r.servidorId);
  await deps.auditar({
    acao: "hermes.chave_reentrada",
    entidadeId: chave.id,
    detalhes: { prefixo: chave.prefixo, instalacao_id: r.id, servidor_id: r.servidorId },
  });
  return {
    status: 200,
    corpo: { modo: "instalar", instalacao_id: r.id, servidor_id: r.servidorId, enroll_token: token, canal: r.canal },
    headers: { "cache-control": "no-store" },
  };
}

/** POST /api/hermes/ativacao/validar — confere a chave sem consumir. */
export async function validarChaveHermes(e: { corpo: string; ip: string }, deps: DepsAtivacao): Promise<RespostaHttp> {
  const j = lerJson(e.corpo);
  if (!j.ok) return j.resposta;
  const p = esquemaValidar.safeParse(j.valor);
  if (!p.success) return { status: 422, corpo: { erro: "CORPO_INVALIDO" } };
  const c = p.data;

  const prep = await preparar(
    { chave: c.chave, cnpj: c.cnpj, fingerprint: c.fingerprint, identificacao: c.identificacao, origem: c.origem_identificacao, versaoInstalador: c.versao_instalador, ip: e.ip },
    deps
  );
  if (!prep.ok) return prep.resposta;

  const cliente = await deps.repo.clienteBasico(prep.chave.clienteId);
  const refCnpj = prep.chave.cnpj ?? cliente?.cnpj ?? prep.cnpj;
  return {
    status: 200,
    corpo: {
      tipo: prep.chave.tipo,
      cliente_nome: cliente?.nome ?? "",
      cnpj_mascarado: mascararCnpjRaiz(refCnpj),
      canal: prep.chave.canalInicial,
      expira_em: prep.chave.expiraEm.toISOString(),
    },
  };
}

/** Prova de posse do agente RV existente: assinatura sobre `ativar:<instalacao>`, janela ±5 min (a de verificarHeartbeat). */
async function provaDeAdocao(
  chave: ChaveHermes,
  prova: { servidor_id: string; timestamp: string; assinatura: string } | undefined,
  agora: Date,
  deps: DepsAtivacao
): Promise<string | null> {
  if (!prova || !chave.instalacaoId) return null;
  const s = await deps.repo.servidorParaAdocao(prova.servidor_id);
  if (!s || s.status !== "ativo" || !s.agentePubkey) return null;
  if (s.clienteId !== chave.clienteId) return null;
  if (s.instalacaoVinculadaId && s.instalacaoVinculadaId !== chave.instalacaoId) return null;
  const ok = verificarHeartbeat({
    pubkeyB64: s.agentePubkey,
    timestamp: prova.timestamp,
    rawBody: `ativar:${chave.instalacaoId}`,
    assinaturaB64: prova.assinatura,
    agora: agora.getTime(),
  });
  return ok ? s.id : null;
}

/**
 * POST /api/hermes/ativacao — CONSOME a chave (uso único, atômico no banco).
 *
 * `instalar`: cria servidor pendente + instalação e devolve o token de enroll
 * do agente. `adotar`: o agente RV já instalado prova a posse (assinatura de
 * `ativar:<instalacao>`) e a instalação passa a apontar para o servidor dele.
 * Reentrada idempotente (mesma chave + machine_id_hash, ≤ 30 min).
 */
export async function ativarHermes(e: { corpo: string; ip: string }, deps: DepsAtivacao): Promise<RespostaHttp> {
  const j = lerJson(e.corpo);
  if (!j.ok) return j.resposta;
  const p = esquemaAtivacao.safeParse(j.valor);
  if (!p.success) return { status: 422, corpo: { erro: "CORPO_INVALIDO" } };
  const c = p.data;
  const agora = deps.agora();

  const prep = await preparar(
    { chave: c.chave, cnpj: c.cnpj, fingerprint: c.fingerprint, identificacao: c.identificacao, origem: c.origem_identificacao, versaoInstalador: c.versao_instalador, ip: e.ip },
    deps
  );
  if (!prep.ok) return prep.resposta;
  const { chave, hash, cnpj } = prep;

  const uso: UsoChave = {
    ip: e.ip === "desconhecido" ? null : e.ip,
    fingerprint: { ...c.fingerprint },
    cnpj,
    identificacao: sanitizarIdentificacao(c.identificacao),
    origemIdentificacao: c.origem_identificacao ?? null,
  };

  // ── adoção ──
  if (chave.tipo === "adocao") {
    const servidorId = await provaDeAdocao(chave, c.agente_existente, agora, deps);
    if (!servidorId) return falhar(e.ip, deps);

    if (!prep.livre) {
      // reentrada: mesma máquina, mesmo servidor
      const r = await deps.repo.instalacaoDoResultado(chave.resultadoInstalacaoId as string);
      if (!r || r.servidorId !== servidorId) return falhar(e.ip, deps);
      return { status: 200, corpo: { modo: "adotar", instalacao_id: r.id, servidor_id: servidorId, canal: r.canal } };
    }
    const res = await deps.repo.ativarAdotar(hash, agora, uso, servidorId);
    if (!res) return falhar(e.ip, deps); // perdeu a corrida ou a instalação já tem outro servidor
    await deps.auditar({
      acao: "hermes.chave_usada",
      entidadeId: res.chave.id,
      detalhes: { tipo: "adocao", prefixo: res.chave.prefixo, instalacao_id: res.instalacaoId },
    });
    await deps.auditar({
      acao: "hermes.instalacao_adotada",
      entidadeId: res.instalacaoId,
      detalhes: { servidor_id: servidorId, cnpj, canal: res.canal, nome: nomeDaIdentificacao(uso.identificacao) },
    });
    return {
      status: 200,
      corpo: { modo: "adotar", instalacao_id: res.instalacaoId, servidor_id: servidorId, canal: res.canal },
    };
  }

  // ── instalação nova ──
  if (!prep.livre) {
    const r = await deps.repo.instalacaoDoResultado(chave.resultadoInstalacaoId as string);
    // só enquanto o agente ainda não se registrou: o token anterior é substituído por um novo
    if (!r?.servidorId || r.servidorStatus !== "pendente") return falhar(e.ip, deps);
    return reemitirEnroll(chave, { ...r, servidorId: r.servidorId }, deps);
  }

  const res = await deps.repo.ativarInstalar(hash, agora, uso);
  if (!res) {
    // perdeu a corrida: se foi a MESMA máquina (retry simultâneo), vale como reentrada; senão, genérico
    const atual = await deps.repo.chavePorHash(hash);
    if (reentrada(atual, c.fingerprint.machine_id_hash, agora)) {
      const r = await deps.repo.instalacaoDoResultado(atual.resultadoInstalacaoId as string);
      if (r?.servidorId && r.servidorStatus === "pendente") return reemitirEnroll(atual, { ...r, servidorId: r.servidorId }, deps);
    }
    return falhar(e.ip, deps);
  }

  const token = await deps.gerarTokenEnroll(res.servidorId);
  await deps.auditar({
    acao: "hermes.chave_usada",
    entidadeId: res.chave.id,
    detalhes: { tipo: "instalacao", prefixo: res.chave.prefixo, instalacao_id: res.instalacaoId },
  });
  await deps.auditar({
    acao: "hermes.instalacao_criada",
    entidadeId: res.instalacaoId,
    detalhes: { servidor_id: res.servidorId, cnpj, canal: res.canal, nome: nomeDaIdentificacao(uso.identificacao) },
  });
  return {
    status: 200,
    corpo: {
      modo: "instalar",
      instalacao_id: res.instalacaoId,
      servidor_id: res.servidorId,
      enroll_token: token,
      canal: res.canal,
    },
    headers: { "cache-control": "no-store" },
  };
}
