/**
 * Serviços do painel do Hermes (puros: sem Next, sem banco, sem `server-only`). Tudo o que fala
 * com o mundo entra por `Deps*`; a composição de produção fica em hermes-painel-runtime.ts e o SQL
 * em hermes-painel-repo.ts. As Server Actions só autorizam, validam o formulário e chamam estes.
 *
 * Regras:
 *  - nada aqui devolve ou audita a chave em claro (só o prefixo de 8 caracteres);
 *  - toda mutação que de fato muda estado audita (`entidade: "hermes"`); no-op não audita;
 *  - "passar a valer" exige frase digitada + prova de chave real na frota; voltar a simulação, nunca.
 */
import { z } from "zod";

import { cnpjValido, soDigitosCnpj } from "@/lib/hermes/cnpj";
import { expiraEmChave, gerarChaveHermes } from "@/lib/hermes/chave";
import { montarEnforcement, type EnforcementHermes } from "@/lib/hermes/config-valores";
import type { CanalHermes, EnforcementInstalacao, ModoHermes } from "@/lib/hermes/documento";
import {
  avaliarProntidaoEnforcement,
  chaveConfigurada,
  confirmacaoValerConfere,
  resumoSaude,
  situacaoChave,
  type ProntidaoEnforcement,
  type SituacaoChave,
} from "@/lib/hermes/painel";
import type { OrigemHermes, StatusHermes } from "@/lib/hermes/licenca";
import { statusServidor, type StatusServidor } from "@/lib/dominio/servidor";
import { derivarDocumento, type DepsLicenca } from "./hermes-licenca-instalacao";
import type { EntradaAuditoria, InstalacaoHermes, StatusInstalacao } from "./hermes-tipos";

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const uuid = z.string().uuid();
const CANAIS = ["stable", "preview"] as const satisfies readonly CanalHermes[];
const MOTIVO_MAX = 200;

// ── tipos de leitura ────────────────────────────────────────────────────────

/** Linha do join instalação x cliente x servidor, como o repositório entrega. */
export type InstalacaoBruta = {
  id: string;
  clienteId: string;
  clienteNome: string;
  nome: string;
  cnpj: string | null;
  status: StatusInstalacao;
  canal: CanalHermes;
  enforcement: EnforcementInstalacao;
  versao: string | null;
  sha: string | null;
  digest: string | null;
  canalEmUso: string | null;
  saude: Record<string, unknown> | null;
  cloneSuspeitoEm: Date | null;
  ultimoEstadoEm: Date | null;
  ativadaEm: Date | null;
  criadoEm: Date;
  criadoPor: string | null;
  servidorId: string | null;
  servidorNome: string | null;
  servidorStatus: "pendente" | "ativo" | "revogado" | null;
  servidorUltimoContatoEm: Date | null;
  servidorAgenteVersao: string | null;
  servidorVersaoAlvo: string | null;
};

export type EventoBruto = {
  id: number;
  tipo: string;
  severidade: "info" | "aviso" | "critico";
  mensagem: string;
  dados: Record<string, unknown> | null;
  criadoEm: Date;
};

export type ChaveBruta = {
  id: string;
  tipo: "instalacao" | "adocao";
  prefixo: string;
  expiraEm: Date;
  usadaEm: Date | null;
  revogadaEm: Date | null;
  criadoEm: Date;
  criadoPor: string;
};

export type ChaveListada = ChaveBruta & {
  clienteId: string;
  clienteNome: string;
  canalInicial: CanalHermes;
  instalacaoId: string | null;
};

export interface DepsLeituraPainel extends DepsLicenca {
  agora(): Date;
  instalacoes(): Promise<InstalacaoBruta[]>;
  instalacao(id: string): Promise<InstalacaoBruta | null>;
  /** Eventos `hermes_*` do servidor, do mais novo para o mais antigo. */
  eventos(servidorId: string, limite: number): Promise<EventoBruto[]>;
  chavesDaInstalacao(instalacaoId: string): Promise<ChaveBruta[]>;
  /** Versões de agente publicadas e ativas (distintas), da mais nova para a mais antiga. */
  versoesAgente(): Promise<string[]>;
  lerEnforcement(): Promise<EnforcementHermes>;
}

// ── view-models (serializáveis: datas em ISO) ───────────────────────────────

export type LicencaResumo = {
  status: StatusHermes;
  origem: OrigemHermes;
  bloqueante: boolean;
  panico: boolean;
  modo: ModoHermes;
  carenciaAte: string | null;
  expiraEm: string | null;
  aviso: string | null;
};

export type LinhaInstalacao = {
  id: string;
  clienteId: string;
  clienteNome: string;
  nome: string;
  cnpj: string | null;
  status: StatusInstalacao;
  canal: CanalHermes;
  canalEmUso: string | null;
  enforcement: EnforcementInstalacao;
  versao: string | null;
  digest: string | null;
  saude: ReturnType<typeof resumoSaude>;
  /** Prova de chave real reportada pelo agente; null = sem informação (hoje, sempre). */
  chaveConfigurada: boolean | null;
  servidorId: string | null;
  servidorNome: string | null;
  statusServidor: StatusServidor | null;
  ultimoContatoEm: string | null;
  agenteVersao: string | null;
  cloneSuspeitoEm: string | null;
  ativadaEm: string | null;
  criadoEm: string;
  licenca: LicencaResumo;
};

export type LinhaChave = {
  id: string;
  tipo: "instalacao" | "adocao";
  prefixo: string;
  situacao: SituacaoChave;
  expiraEm: string;
  usadaEm: string | null;
  revogadaEm: string | null;
  criadoEm: string;
  criadoPor: string;
};

export type LinhaChaveListada = LinhaChave & {
  clienteId: string;
  clienteNome: string;
  canalInicial: CanalHermes;
  instalacaoId: string | null;
};

export type EventoPainel = {
  id: number;
  tipo: string;
  severidade: "info" | "aviso" | "critico";
  mensagem: string;
  criadoEm: string;
};

export type VisaoGeral = {
  linhas: LinhaInstalacao[];
  enforcement: EnforcementHermes;
  prontidao: ProntidaoEnforcement;
  /** Instalações ativas que passariam a bloquear de verdade ao "passar a valer". */
  bloqueariamAoValer: number;
};

export type DetalheInstalacao = {
  linha: LinhaInstalacao;
  eventos: EventoPainel[];
  alertasClone: { id: number; motivo: string | null; em: string }[];
  chaves: LinhaChave[];
  /** Pin atual do agente (servidores.versao_alvo); null = automático (última estável). */
  versaoAlvoAgente: string | null;
  versoesAgente: string[];
};

const montarChave = (c: ChaveBruta, agora: Date): LinhaChave => ({
  id: c.id,
  tipo: c.tipo,
  prefixo: c.prefixo,
  situacao: situacaoChave(c, agora),
  expiraEm: c.expiraEm.toISOString(),
  usadaEm: iso(c.usadaEm),
  revogadaEm: iso(c.revogadaEm),
  criadoEm: c.criadoEm.toISOString(),
  criadoPor: c.criadoPor,
});

function paraInstalacaoHermes(b: InstalacaoBruta): InstalacaoHermes {
  return {
    id: b.id,
    clienteId: b.clienteId,
    servidorId: b.servidorId,
    nome: b.nome,
    cnpj: b.cnpj,
    status: b.status,
    canal: b.canal,
    enforcement: b.enforcement,
    versao: b.versao,
    sha: b.sha,
    digest: b.digest,
    canalEmUso: b.canalEmUso,
    saude: b.saude,
    fingerprint: null,
    ultimoTsAgente: null,
    cloneSuspeitoEm: b.cloneSuspeitoEm,
    ativadaEm: b.ativadaEm,
  };
}

/** Memoriza `dadosLicenca` por cliente: várias instalações do mesmo cliente = uma consulta. */
function comMemoDeLicenca(deps: DepsLicenca): DepsLicenca {
  const cache = new Map<string, ReturnType<DepsLicenca["dadosLicenca"]>>();
  return {
    dadosLicenca(clienteId) {
      let p = cache.get(clienteId);
      if (!p) {
        p = deps.dadosLicenca(clienteId);
        cache.set(clienteId, p);
      }
      return p;
    },
    configEnforcement: () => deps.configEnforcement(),
  };
}

async function montarLinha(b: InstalacaoBruta, agora: Date, deps: DepsLicenca): Promise<LinhaInstalacao> {
  const { licenca, documento } = await derivarDocumento(paraInstalacaoHermes(b), agora, deps);
  return {
    id: b.id,
    clienteId: b.clienteId,
    clienteNome: b.clienteNome,
    nome: b.nome,
    cnpj: b.cnpj,
    status: b.status,
    canal: b.canal,
    canalEmUso: b.canalEmUso,
    enforcement: b.enforcement,
    versao: b.versao,
    digest: b.digest,
    saude: resumoSaude(b.saude),
    chaveConfigurada: chaveConfigurada(b.saude),
    servidorId: b.servidorId,
    servidorNome: b.servidorNome,
    statusServidor: b.servidorStatus
      ? statusServidor({ status: b.servidorStatus, ultimoContatoEm: b.servidorUltimoContatoEm }, agora.getTime())
      : null,
    ultimoContatoEm: iso(b.servidorUltimoContatoEm),
    agenteVersao: b.servidorAgenteVersao ?? resumoSaude(b.saude).agenteVersao,
    cloneSuspeitoEm: iso(b.cloneSuspeitoEm),
    ativadaEm: iso(b.ativadaEm),
    criadoEm: b.criadoEm.toISOString(),
    licenca: {
      status: licenca.status,
      origem: licenca.origem,
      bloqueante: licenca.bloqueante,
      panico: licenca.panico,
      modo: documento.modo,
      carenciaAte: licenca.carencia_ate,
      expiraEm: licenca.expira_em,
      aviso: documento.aviso,
    },
  };
}

export async function visaoGeralPainel(deps: DepsLeituraPainel): Promise<VisaoGeral> {
  const agora = deps.agora();
  const brutas = await deps.instalacoes();
  const licDeps = comMemoDeLicenca(deps);
  const [linhas, enforcement] = await Promise.all([
    Promise.all(brutas.map((b) => montarLinha(b, agora, licDeps))),
    deps.lerEnforcement(),
  ]);
  return {
    linhas,
    enforcement,
    prontidao: avaliarProntidaoEnforcement(brutas),
    bloqueariamAoValer: linhas.filter((l) => l.status === "ativa" && l.enforcement === "herdar" && l.licenca.bloqueante).length,
  };
}

export async function detalheInstalacaoPainel(id: string, deps: DepsLeituraPainel): Promise<DetalheInstalacao | null> {
  if (!uuid.safeParse(id).success) return null;
  const agora = deps.agora();
  const b = await deps.instalacao(id);
  if (!b) return null;
  const [linha, eventos, chaves, versoesAgente] = await Promise.all([
    montarLinha(b, agora, deps),
    b.servidorId ? deps.eventos(b.servidorId, 30) : Promise.resolve([] as EventoBruto[]),
    deps.chavesDaInstalacao(id),
    deps.versoesAgente(),
  ]);
  return {
    linha,
    eventos: eventos.map((e) => ({ id: e.id, tipo: e.tipo, severidade: e.severidade, mensagem: e.mensagem, criadoEm: e.criadoEm.toISOString() })),
    alertasClone: eventos
      .filter((e) => e.tipo === "hermes_clone_suspeito")
      .map((e) => ({ id: e.id, motivo: typeof e.dados?.motivo === "string" ? e.dados.motivo : null, em: e.criadoEm.toISOString() })),
    chaves: chaves.map((c) => montarChave(c, agora)),
    versaoAlvoAgente: b.servidorVersaoAlvo,
    versoesAgente,
  };
}

export function montarChavesListadas(brutas: ChaveListada[], agora: Date): LinhaChaveListada[] {
  return brutas.map((c) => ({
    ...montarChave(c, agora),
    clienteId: c.clienteId,
    clienteNome: c.clienteNome,
    canalInicial: c.canalInicial,
    instalacaoId: c.instalacaoId,
  }));
}

// ── escrita ─────────────────────────────────────────────────────────────────

export type Falha = { ok: false; erro: string };
const falha = (erro: string): Falha => ({ ok: false, erro });

export interface DepsEscritaPainel {
  agora(): Date;
  auditar(a: EntradaAuditoria): Promise<void>;
  // chaves
  cliente(id: string): Promise<{ id: string; nome: string; documento: string | null; status: string } | null>;
  instalacaoParaAdocao(id: string): Promise<{ id: string; clienteId: string; servidorId: string | null; status: string } | null>;
  /**
   * Insere a chave (só hash + prefixo). `criarInstalacao` != null: na MESMA transação resolve a instalação
   * de adoção (sem servidor) e a vincula à chave: REAPROVEITA a órfã mais recente do MESMO cliente (sem
   * servidor, `aguardando_ativacao`, criada pelo painel) e só cria uma nova se não houver; as emissões do
   * mesmo cliente são serializadas (clique duplo não duplica). Devolve o id da chave, o da instalação alvo
   * e se ela foi criada agora (`false` = reaproveitada, ou chave de instalação, que não tem instalação alvo).
   */
  inserirChave(d: {
    tipo: "instalacao" | "adocao";
    clienteId: string;
    cnpj: string;
    instalacaoId: string | null;
    criarInstalacao: { nome: string; canal: CanalHermes } | null;
    hash: string;
    prefixo: string;
    canalInicial: CanalHermes;
    expiraEm: Date;
    por: string;
  }): Promise<{ id: string; instalacaoId: string | null; instalacaoCriada: boolean }>;
  /** Atômico: revoga só se ainda não usada nem revogada; null = nada revogado. */
  revogarChaveAberta(id: string, por: string, agora: Date): Promise<{ prefixo: string; tipo: "instalacao" | "adocao"; clienteId: string } | null>;
  // canal e atualização
  instalacaoSimples(id: string): Promise<{ id: string; status: string; canal: CanalHermes; servidorId: string | null; nome: string } | null>;
  atualizarCanal(id: string, canal: CanalHermes): Promise<void>;
  versaoAlvoServidor(servidorId: string): Promise<string | null>;
  versaoAgenteExiste(versao: string): Promise<boolean>;
  fixarVersaoAlvo(servidorId: string, versao: string | null): Promise<void>;
  // enforcement global
  instalacoesParaProva(): Promise<{ id: string; nome: string; status: string; saude: Record<string, unknown> | null }[]>;
  lerEnforcement(): Promise<EnforcementHermes>;
  gravarEnforcement(e: EnforcementHermes): Promise<void>;
}

// ── chaves de instalação/adoção ─────────────────────────────────────────────

const esquemaGerar = z.object({
  tipo: z.enum(["instalacao", "adocao"]),
  clienteId: uuid,
  canal: z.enum(CANAIS),
  instalacaoId: uuid.optional(),
});

export type ResultadoGerarChave = { ok: true; chave: string; prefixo: string; tipo: "instalacao" | "adocao"; expiraEm: string; clienteNome: string; instalacaoId: string | null } | Falha;

/** Emite a chave (instalação 12 h / adoção 24 h). O valor em claro volta UMA vez, só ao chamador. */
export async function gerarChavePainel(
  e: { tipo: "instalacao" | "adocao"; clienteId: string; canal: CanalHermes; instalacaoId?: string; por: string },
  deps: DepsEscritaPainel
): Promise<ResultadoGerarChave> {
  const p = esquemaGerar.safeParse(e);
  if (!p.success) return falha("Dados inválidos para gerar a chave.");
  const d = p.data;

  const cliente = await deps.cliente(d.clienteId);
  if (!cliente || cliente.status !== "ativo") return falha("Cliente não encontrado ou arquivado.");
  if (!cnpjValido(cliente.documento)) {
    return falha("O cliente precisa ter um CNPJ válido cadastrado: a chave fica presa à raiz do CNPJ.");
  }

  let instalacaoId: string | null = null;
  if (d.tipo === "adocao" && d.instalacaoId) {
    const i = await deps.instalacaoParaAdocao(d.instalacaoId);
    if (!i || i.clienteId !== d.clienteId) return falha("Instalação não encontrada para este cliente.");
    if (i.servidorId) return falha("Esta instalação já tem um servidor vinculado.");
    if (i.status === "revogada" || i.status === "desinstalada") return falha("Esta instalação está revogada ou desinstalada.");
    instalacaoId = i.id;
  }

  const agora = deps.agora();
  const g = gerarChaveHermes();
  const expiraEm = expiraEmChave(d.tipo, agora);
  const r = await deps.inserirChave({
    tipo: d.tipo,
    clienteId: d.clienteId,
    cnpj: soDigitosCnpj(cliente.documento),
    instalacaoId,
    criarInstalacao: d.tipo === "adocao" && !instalacaoId ? { nome: cliente.nome, canal: d.canal } : null,
    hash: g.hash,
    prefixo: g.prefixo,
    canalInicial: d.canal,
    expiraEm,
    por: e.por,
  });

  await deps.auditar({
    acao: "hermes.chave_emitida",
    entidadeId: r.id,
    detalhes: {
      tipo: d.tipo,
      prefixo: g.prefixo,
      cliente_id: d.clienteId,
      canal: d.canal,
      expira_em: expiraEm.toISOString(),
      instalacao_id: r.instalacaoId,
      ...(d.tipo === "adocao" ? { instalacao_criada: r.instalacaoCriada } : {}),
    },
  });
  return { ok: true, chave: g.chave, prefixo: g.prefixo, tipo: d.tipo, expiraEm: expiraEm.toISOString(), clienteNome: cliente.nome, instalacaoId: r.instalacaoId };
}

export async function revogarChavePainel(e: { chaveId: string; por: string }, deps: DepsEscritaPainel): Promise<{ ok: true } | Falha> {
  if (!uuid.safeParse(e.chaveId).success) return falha("Chave inválida.");
  const r = await deps.revogarChaveAberta(e.chaveId, e.por, deps.agora());
  if (!r) return falha("Esta chave já foi usada, revogada ou não existe.");
  await deps.auditar({
    acao: "hermes.chave_revogada",
    entidadeId: e.chaveId,
    detalhes: { prefixo: r.prefixo, tipo: r.tipo, cliente_id: r.clienteId },
  });
  return { ok: true };
}

// ── canal por instalação ────────────────────────────────────────────────────

const esquemaCanal = z.object({ instalacaoId: uuid, canal: z.enum(CANAIS) });

export async function trocarCanalPainel(
  e: { instalacaoId: string; canal: CanalHermes; por: string },
  deps: DepsEscritaPainel
): Promise<{ ok: true; mudou: boolean; canal: CanalHermes } | Falha> {
  const p = esquemaCanal.safeParse(e);
  if (!p.success) return falha("Canal inválido.");
  const i = await deps.instalacaoSimples(p.data.instalacaoId);
  if (!i) return falha("Instalação não encontrada.");
  if (i.status === "revogada" || i.status === "desinstalada") return falha("Instalação revogada ou desinstalada: o canal não se aplica.");
  if (i.canal === p.data.canal) return { ok: true, mudou: false, canal: i.canal };

  await deps.atualizarCanal(i.id, p.data.canal);
  await deps.auditar({
    acao: "hermes.canal_alterado",
    entidadeId: i.id,
    detalhes: { de: i.canal, para: p.data.canal, nome: i.nome },
  });
  return { ok: true, mudou: true, canal: p.data.canal };
}

// ── enforcement global ──────────────────────────────────────────────────────

export type ResultadoEnforcement = { ok: true; mudou: boolean; ativo: boolean } | Falha;

/**
 * Alterna `hermes_enforcement`. Valendo: exige a frase digitada E a prova de chave real em toda
 * instalação ativa (o motivo da recusa vem do servidor, não da tela). Simulação: sempre permitida.
 */
export async function definirEnforcementPainel(
  e: { alvo: "valendo" | "simulacao"; confirmacao?: string | null; motivo?: string | null; por: string },
  deps: DepsEscritaPainel
): Promise<ResultadoEnforcement> {
  if (e.alvo !== "valendo" && e.alvo !== "simulacao") return falha("Modo inválido.");
  const ativar = e.alvo === "valendo";
  const atual = await deps.lerEnforcement();
  if (atual.ativo === ativar) return { ok: true, mudou: false, ativo: ativar };

  let prova: ProntidaoEnforcement | null = null;
  if (ativar) {
    if (!confirmacaoValerConfere(e.confirmacao)) return falha("Digite VALER HERMES para confirmar.");
    prova = avaliarProntidaoEnforcement(await deps.instalacoesParaProva());
    if (!prova.pode) return falha(prova.motivo ?? "Sem prova de chave real na frota.");
  }

  const motivo = (e.motivo ?? "").trim().slice(0, MOTIVO_MAX) || null;
  const novo = montarEnforcement({ ativo: ativar, por: e.por, motivo }, deps.agora());
  await deps.gravarEnforcement(novo);
  await deps.auditar({
    acao: ativar ? "hermes.enforcement_valendo" : "hermes.enforcement_simulacao",
    detalhes: {
      de: atual.ativo,
      para: ativar,
      motivo,
      ...(prova ? { instalacoes_com_prova: prova.comProva, instalacoes_ativas: prova.total } : {}),
    },
  });
  return { ok: true, mudou: true, ativo: ativar };
}

// ── atualização forçada ─────────────────────────────────────────────────────

const esquemaVersao = z.object({
  instalacaoId: uuid,
  versao: z.string().trim().min(1).max(40).nullable(),
});

/**
 * Agente RV: usa o mecanismo que o servidor JÁ tem. O sync devolve `agente_alvo` = pin do
 * servidor (`servidores.versao_alvo`) ou, sem pin, a última estável; o agente baixa se difere
 * da versão instalada. "Forçar" = fixar a versão; `null` = voltar ao automático.
 */
export async function fixarVersaoAgentePainel(
  e: { instalacaoId: string; versao: string | null; por: string },
  deps: DepsEscritaPainel
): Promise<{ ok: true; mudou: boolean; versao: string | null } | Falha> {
  const p = esquemaVersao.safeParse({ instalacaoId: e.instalacaoId, versao: e.versao });
  if (!p.success) return falha("Versão inválida.");
  const i = await deps.instalacaoSimples(p.data.instalacaoId);
  if (!i) return falha("Instalação não encontrada.");
  if (i.status === "revogada" || i.status === "desinstalada") return falha("Instalação revogada ou desinstalada.");
  if (!i.servidorId) return falha("A instalação ainda não tem servidor vinculado.");

  const { versao } = p.data;
  if (versao !== null && !(await deps.versaoAgenteExiste(versao))) {
    return falha("Essa versão não está publicada (ou está inativa) no painel de release do agente.");
  }
  const de = await deps.versaoAlvoServidor(i.servidorId);
  if (de === versao) return { ok: true, mudou: false, versao };

  await deps.fixarVersaoAlvo(i.servidorId, versao);
  await deps.auditar({
    acao: "hermes.agente_versao_fixada",
    entidadeId: i.id,
    detalhes: { servidor_id: i.servidorId, de, para: versao, nome: i.nome },
  });
  return { ok: true, mudou: true, versao };
}

/**
 * Container (`digest_alvo`): NÃO há coluna nem serviço para isso hoje. O sync devolve
 * `digest_alvo: null` fixo e o agente/instalador não consome outro caminho.
 *
 * TODO (depende de decisão e de migration, fora do P12): ver a proposta na devolução do P12 —
 *   colunas `hermes_instalacoes.digest_alvo` (text, formato sha256:<64 hex>) e `digest_alvo_em`;
 *   regra: o sync devolve o `digest_alvo` da instalação (ou null); o agente puxa a imagem com a
 *   credencial da rota `credencial`, valida o digest e reporta `hermes_update_ok/falhou`;
 *   impacto: migration aditiva, ajuste em `tratarSyncHermes`/protocolo e no agente Go.
 * Enquanto isso, este serviço só valida a entrada e recusa, sem escrever nada.
 */
export function forcarAtualizacaoContainer(e: { instalacaoId: string }): Falha & { codigo: "ENTRADA_INVALIDA" | "NAO_IMPLEMENTADO" } {
  if (!uuid.safeParse(e.instalacaoId).success) return { ok: false, codigo: "ENTRADA_INVALIDA", erro: "Instalação inválida." };
  return {
    ok: false,
    codigo: "NAO_IMPLEMENTADO",
    erro:
      "Atualização do container ainda não está disponível: o servidor não tem digest_alvo (coluna e entrega no sync). " +
      "Use a versão do agente ou aguarde a decisão sobre o digest_alvo.",
  };
}
