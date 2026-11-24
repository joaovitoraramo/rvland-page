import type { RepoLimites } from "./hermes-limite";

/** Repositórios EM MEMÓRIA para testes (vitest) — não usar em produção. */

export function repoLimitesMemoria(): RepoLimites & { mapa: Map<string, number> } {
  const mapa = new Map<string, number>();
  const k = (c: string, j: Date) => `${c}|${j.toISOString()}`;
  return {
    mapa,
    async incrementar(c, j) {
      const n = (mapa.get(k(c, j)) ?? 0) + 1;
      mapa.set(k(c, j), n);
      return n;
    },
    async ler(c, j) {
      return mapa.get(k(c, j)) ?? 0;
    },
  };
}

// ── Mundo em memória do agente (sync/credencial) ────────────────────────────
import { assinar, gerarParEd25519 } from "@/lib/crypto/ed25519";
import { mensagemAssinada } from "@/lib/crypto/heartbeat-auth";
import { assinarPedidoHermes, type RotaAgenteHermes } from "@/lib/hermes/assinatura-agente";
import { assinarDocumentoHermes } from "@/lib/crypto/hermes";
import type { ControleClone } from "@/lib/hermes/clone";
import type { DocumentoHermes } from "@/lib/hermes/documento";
import type { EntradaAgente } from "./hermes-agente-auth";
import type {
  ConfigEnforcement,
  DadosLicenca,
  EntradaAuditoria,
  EventoNovo,
  InstalacaoHermes,
  PatchInstalacao,
  ServidorAgente,
} from "./hermes-tipos";

export const SERVIDOR_ID = "11111111-1111-4111-8111-111111111111";
export const INSTALACAO_ID = "22222222-2222-4222-8222-222222222222";
export const CLIENTE_ID = "33333333-3333-4333-8333-333333333333";

export function criarMundoAgente(
  over: {
    agora?: Date;
    instalacao?: Partial<InstalacaoHermes>;
    dados?: Partial<DadosLicenca>;
    config?: Partial<ConfigEnforcement>;
    semInstalacao?: boolean;
  } = {}
) {
  const agente = gerarParEd25519(); // chave do servidor (agente RV)
  const hermes = gerarParEd25519(); // chave de assinatura do documento
  let agora = over.agora ?? new Date("2026-11-23T12:00:00.000Z");

  const servidor: ServidorAgente = { id: SERVIDOR_ID, clienteId: CLIENTE_ID, agentePubkey: agente.publicaB64 };
  const mundo = {
    agente,
    hermes,
    servidor,
    instalacao: {
      id: INSTALACAO_ID,
      clienteId: CLIENTE_ID,
      servidorId: SERVIDOR_ID,
      nome: "Cliente Teste",
      cnpj: "11222333000181",
      status: "aguardando_ativacao",
      canal: "stable",
      enforcement: "herdar",
      versao: null,
      sha: null,
      digest: null,
      canalEmUso: null,
      saude: null,
      fingerprint: null,
      ultimoTsAgente: null,
      cloneSuspeitoEm: null,
      ativadaEm: null,
      ...over.instalacao,
    } as InstalacaoHermes,
    dados: {
      hermesLicenca: { independeFinanceiro: true, renovacaoDias: 30, bloqueioManual: false, diasConfianca: 0 },
      contrato: null,
      modoPanico: false,
      maxDiasConfianca: 7,
      ...over.dados,
    } as DadosLicenca,
    config: { enforcementAtivo: false, offlineHoras: 72, ...over.config } as ConfigEnforcement,
    eventos: [] as (EventoNovo & { servidorId: string })[],
    auditoria: [] as EntradaAuditoria[],
    telegrams: [] as string[],
    patches: [] as PatchInstalacao[],
    /** Contatos registrados em `servidores.ultimo_contato_em` (sync autenticado e aceito). */
    contatos: [] as { servidorId: string; em: Date }[],
    /**
     * Coluna `servidores.agente_versao` do servidor do mundo. Reproduz a regra de `registrarContatoServidor`
     * (hermes-repo.ts): versão ausente/vazia NÃO sobrescreve. A regra do repo em si é provada em
     * hermes-repo-contato.test.ts (unidade) e no caso 5e da integração do painel (SQL real).
     */
    servidorAgenteVersao: null as string | null,
    /** Versões efetivamente gravadas na coluna, em ordem. */
    versoesAgente: [] as { servidorId: string; versao: string }[],
    falhaContato: false,
    /** Versão-alvo do agente (painel de release); "erro" simula falha da consulta. */
    versaoAlvoAgente: null as string | null | "erro",
    avancarSempre: true,
    falhaAssinatura: false,
    set agora(d: Date) {
      agora = d;
    },
    get agoraAtual() {
      return agora;
    },
  };

  const deps = {
    agora: () => new Date(agora),
    async servidorAtivo(id: string) {
      return id === servidor.id ? servidor : null;
    },
    async instalacaoPorServidor(id: string) {
      // cópia: o serviço trabalha com um retrato (como a leitura do banco), não com a linha viva
      return over.semInstalacao || id !== SERVIDOR_ID ? null : { ...mundo.instalacao };
    },
    async dadosLicenca() {
      return mundo.dados;
    },
    async configEnforcement() {
      return mundo.config;
    },
    async avancarTimestamp(id: string, ts: Date) {
      const i = mundo.instalacao;
      if (id !== i.id || !mundo.avancarSempre) return false;
      if (i.ultimoTsAgente && ts.getTime() <= i.ultimoTsAgente.getTime()) return false;
      i.ultimoTsAgente = ts;
      return true;
    },
    async gravarInstalacao(_id: string, patch: PatchInstalacao) {
      mundo.patches.push(patch);
      Object.assign(mundo.instalacao, patch);
    },
    /** Mesma semântica do `UPDATE ... SET status='ativa' WHERE id=$1 AND status='aguardando_ativacao'`. */
    async ativarSeAguardando(id: string, agoraU: Date) {
      const i = mundo.instalacao;
      if (id !== i.id || i.status !== "aguardando_ativacao") return false;
      i.status = "ativa";
      i.ativadaEm = agoraU;
      return true;
    },
    /** Mesma semântica do `jsonb_set` de chave única: só `_controle`, o resto de `saude` fica. */
    async gravarControleClone(id: string, controle: ControleClone) {
      if (id !== mundo.instalacao.id) return;
      mundo.instalacao.saude = { ...(mundo.instalacao.saude ?? {}), _controle: controle };
    },
    async inserirEventos(servidorId: string, evs: EventoNovo[]) {
      for (const e of evs) mundo.eventos.push({ ...e, servidorId });
    },
    async registrarContato(servidorId: string, em: Date, agenteVersao?: string | null) {
      if (mundo.falhaContato) throw new Error("banco indisponível");
      mundo.contatos.push({ servidorId, em });
      if (agenteVersao) {
        mundo.servidorAgenteVersao = agenteVersao;
        mundo.versoesAgente.push({ servidorId, versao: agenteVersao });
      }
    },
    async versaoAlvoAgente() {
      if (mundo.versaoAlvoAgente === "erro") throw new Error("banco indisponível");
      return mundo.versaoAlvoAgente;
    },
    assinar(doc: DocumentoHermes) {
      if (mundo.falhaAssinatura) throw new Error("RVLAND_HERMES_SK não configurada (detalhe interno)");
      return assinarDocumentoHermes(doc, hermes.privadaB64);
    },
    async auditar(a: EntradaAuditoria) {
      mundo.auditoria.push(a);
    },
    async telegram(t: string) {
      mundo.telegrams.push(t);
      return true;
    },
    limites: repoLimitesMemoria(),
  };

  /**
   * Monta o pedido assinado como o agente faz (timestamp = relógio do mundo, salvo `ts`).
   * `rota` (padrão `sync`) escolhe o domínio da assinatura; `rota: "heartbeat"` assina
   * como o heartbeat do Credit (para provar que NÃO vale nas rotas Hermes).
   */
  function pedido(
    corpo: unknown,
    opts: { ts?: Date; corpoCru?: string; servidorId?: string; assinarCom?: string; rota?: RotaAgenteHermes | "heartbeat" } = {}
  ): EntradaAgente {
    const rawBody = opts.corpoCru ?? JSON.stringify(corpo ?? {});
    const timestamp = (opts.ts ?? agora).toISOString();
    const priv = opts.assinarCom ?? agente.privadaB64;
    const rota = opts.rota ?? "sync";
    return {
      servidorId: opts.servidorId ?? SERVIDOR_ID,
      timestamp,
      rawBody,
      assinatura:
        rota === "heartbeat"
          ? assinar(mensagemAssinada(timestamp, rawBody), priv)
          : assinarPedidoHermes(rota, timestamp, rawBody, priv),
    };
  }

  return { mundo, deps, pedido };
}

export const MACHINE_ID = "a".repeat(64);

export function corpoSyncValido(over: Record<string, unknown> = {}) {
  return {
    agente_versao: "0.7.0",
    container: { estado: "rodando", saude: "saudavel", versao: "0.14.26", digest: "sha256:" + "c".repeat(64), canal_em_uso: "stable" },
    fingerprint: { machine_id_hash: MACHINE_ID, boot_id: "boot-A" },
    relogio: { confiavel: true },
    ...over,
  };
}

// ── Mundo público em memória (solicitações e ativação) ──────────────────────
import { gerarChaveHermes, expiraEmChave } from "@/lib/hermes/chave";
import { criadoPorChave } from "@/lib/hermes/origem-servidor";
import type { ChaveHermes, RepoAtivacao, RepoSolicitacoes, DadosSolicitacao } from "./hermes-ativacao-tipos";

export const CNPJ_CLIENTE = "11222333000181";

export function criarMundoPublico(over: { agora?: Date } = {}) {
  let agora = over.agora ?? new Date("2026-11-23T12:00:00.000Z");
  const m = {
    chaves: new Map<string, ChaveHermes>(), // por hash
    solicitacoes: [] as (DadosSolicitacao & { protocolo: string; tentativas: number; status: "pendente" | "suspeita" })[],
    instalacoes: [] as { id: string; servidorId: string | null; clienteId: string; canal: string; cnpj: string | null; fingerprint: unknown; status?: string; criadoPor?: string | null }[],
    servidores: new Map<string, { id: string; clienteId: string; status: string; agentePubkey: string | null }>(),
    clientes: new Map([["c1", { nome: "Mercado Teste", cnpj: CNPJ_CLIENTE as string | null }]]),
    auditoria: [] as EntradaAuditoria[],
    telegrams: [] as string[],
    tokensEnroll: [] as string[],
    limites: repoLimitesMemoria(),
    clientePorRaiz: new Map<string, string>(),
    set agora(d: Date) {
      agora = d;
    },
    get agoraAtual() {
      return agora;
    },
  };
  let seqProtocolo = 0;
  let seqId = 0;

  const solicitacoes: RepoSolicitacoes = {
    async upsert(d) {
      const mid = d.fingerprint?.machine_id_hash ?? "";
      const ex = m.solicitacoes.find((s) => s.cnpj === d.cnpj && (s.fingerprint?.machine_id_hash ?? "") === mid);
      if (ex) {
        ex.tentativas++;
        if (d.status === "suspeita" && ex.status === "pendente") ex.status = "suspeita";
        return { protocolo: ex.protocolo, criada: false, tentativas: ex.tentativas };
      }
      const protocolo = `HP-${String(++seqProtocolo).padStart(6, "0")}`;
      m.solicitacoes.push({ ...d, protocolo, tentativas: 1, status: d.status });
      return { protocolo, criada: true, tentativas: 1 };
    },
  };

  const repo: RepoAtivacao = {
    async chavePorHash(hash) {
      const c = m.chaves.get(hash);
      return c ? { ...c } : null;
    },
    async clienteBasico(id) {
      return m.clientes.get(id) ?? null;
    },
    async servidorParaAdocao(id) {
      const s = m.servidores.get(id);
      return s ? { ...s, instalacaoVinculadaId: m.instalacoes.find((i) => i.servidorId === id)?.id ?? null } : null;
    },
    async instalacaoDoResultado(id) {
      const i = m.instalacoes.find((x) => x.id === id);
      if (!i) return null;
      return { id: i.id, servidorId: i.servidorId, canal: i.canal as "stable" | "preview", servidorStatus: i.servidorId ? (m.servidores.get(i.servidorId)?.status ?? null) : null };
    },
    // atômico: checagem e marcação no mesmo trecho síncrono (modelo do UPDATE ... RETURNING)
    async ativarInstalar(hash, agoraU, uso) {
      const c = m.chaves.get(hash);
      if (!c || c.usadaEm || c.revogadaEm || c.expiraEm.getTime() <= agoraU.getTime() || c.tipo !== "instalacao") return null;
      c.usadaEm = agoraU;
      c.usadaFingerprint = uso.fingerprint;
      const servidorId = `s-${++seqId}`;
      const instalacaoId = `i-${++seqId}`;
      m.servidores.set(servidorId, { id: servidorId, clienteId: c.clienteId, status: "pendente", agentePubkey: null });
      m.instalacoes.push({ id: instalacaoId, servidorId, clienteId: c.clienteId, canal: c.canalInicial, cnpj: uso.cnpj, fingerprint: uso.fingerprint, criadoPor: criadoPorChave(c.prefixo) });
      c.resultadoInstalacaoId = instalacaoId;
      return { chave: { ...c }, instalacaoId, servidorId, canal: c.canalInicial };
    },
    async ativarAdotar(hash, agoraU, uso, servidorId) {
      const c = m.chaves.get(hash);
      if (!c || c.usadaEm || c.revogadaEm || c.expiraEm.getTime() <= agoraU.getTime() || c.tipo !== "adocao") return null;
      const inst = m.instalacoes.find((i) => i.id === c.instalacaoId);
      if (!inst || (inst.servidorId && inst.servidorId !== servidorId)) return null;
      // espelha `AND status NOT IN ('revogada','desinstalada')` do SQL: recusa SEM consumir a chave
      if (inst.status === "revogada" || inst.status === "desinstalada") return null;
      c.usadaEm = agoraU;
      c.usadaFingerprint = uso.fingerprint;
      inst.servidorId = servidorId;
      c.resultadoInstalacaoId = inst.id;
      return { chave: { ...c }, instalacaoId: inst.id, servidorId, canal: inst.canal as "stable" | "preview" };
    },
  };

  /** Cria uma chave no mundo e devolve o texto (como o painel mostraria uma vez). */
  function emitirChave(opts: Partial<ChaveHermes> & { tipo?: "instalacao" | "adocao" } = {}) {
    const g = gerarChaveHermes();
    const tipo = opts.tipo ?? "instalacao";
    m.chaves.set(g.hash, {
      id: `k-${m.chaves.size + 1}`,
      tipo,
      clienteId: "c1",
      cnpj: CNPJ_CLIENTE,
      instalacaoId: null,
      prefixo: g.prefixo,
      canalInicial: "stable",
      expiraEm: expiraEmChave(tipo, agora),
      usadaEm: null,
      usadaFingerprint: null,
      resultadoInstalacaoId: null,
      revogadaEm: null,
      ...opts,
    });
    return g.chave;
  }

  const deps = {
    agora: () => new Date(agora),
    limites: m.limites,
    solicitacoes,
    repo,
    async clientePorRaiz(raiz: string) {
      return m.clientePorRaiz.get(raiz) ?? null;
    },
    async gerarTokenEnroll(servidorId: string) {
      const t = `enroll-${servidorId}-${m.tokensEnroll.length + 1}`;
      m.tokensEnroll.push(t);
      return t;
    },
    async auditar(a: EntradaAuditoria) {
      m.auditoria.push(a);
    },
    async telegram(t: string) {
      m.telegrams.push(t);
      return true;
    },
  };

  return { mundo: m, deps, emitirChave };
}
