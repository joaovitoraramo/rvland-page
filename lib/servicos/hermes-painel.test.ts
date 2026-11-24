import { beforeEach, describe, expect, it } from "vitest";

import { hashChaveHermes, formatoChaveValido } from "@/lib/hermes/chave";
import { montarEnforcement, type EnforcementHermes } from "@/lib/hermes/config-valores";
import type { DadosLicenca, ConfigEnforcement } from "./hermes-tipos";
import {
  definirEnforcementPainel,
  detalheInstalacaoPainel,
  fixarVersaoAgentePainel,
  forcarAtualizacaoContainer,
  gerarChavePainel,
  revogarChavePainel,
  trocarCanalPainel,
  visaoGeralPainel,
  type DepsEscritaPainel,
  type DepsLeituraPainel,
  type InstalacaoBruta,
} from "./hermes-painel";

const AGORA = new Date("2026-11-24T12:00:00.000Z");
const CLIENTE = "33333333-3333-4333-8333-333333333333";
const OUTRO_CLIENTE = "44444444-4444-4444-8444-444444444444";
const INSTALACAO = "22222222-2222-4222-8222-222222222222";
const SERVIDOR = "11111111-1111-4111-8111-111111111111";
const CHAVE_ABERTA = "11111111-1111-4111-8111-aaaaaaaaaaaa";
const CNPJ_OK = "11.222.333/0001-81";

function bruta(over: Partial<InstalacaoBruta> = {}): InstalacaoBruta {
  return {
    id: INSTALACAO,
    clienteId: CLIENTE,
    clienteNome: "Mercado Teste",
    nome: "Mercado Teste",
    cnpj: "11222333000181",
    status: "ativa",
    canal: "stable",
    enforcement: "herdar",
    versao: "0.14.27",
    sha: null,
    digest: "sha256:" + "c".repeat(64),
    canalEmUso: "stable",
    saude: { container: "rodando", saude: "saudavel", relogio_confiavel: true, agente_versao: "0.7.0", _controle: { boots: [], syncs: [] } },
    cloneSuspeitoEm: null,
    ultimoEstadoEm: new Date(AGORA.getTime() - 30_000),
    ativadaEm: new Date("2026-11-20T10:00:00.000Z"),
    criadoEm: new Date("2026-11-20T09:00:00.000Z"),
    criadoPor: "chave:hmk_abcd",
    servidorId: SERVIDOR,
    servidorNome: "Hermes - Mercado Teste",
    servidorStatus: "ativo",
    servidorUltimoContatoEm: new Date(AGORA.getTime() - 30_000),
    servidorAgenteVersao: "0.7.0",
    servidorVersaoAlvo: null,
    ...over,
  };
}

function mundoLeitura(over: { instalacoes?: InstalacaoBruta[]; enforcementAtivo?: boolean; dados?: Partial<DadosLicenca> } = {}) {
  const m = {
    instalacoes: over.instalacoes ?? [bruta()],
    enforcementAtivo: over.enforcementAtivo ?? false,
    dadosChamadas: [] as string[],
    eventos: [] as { id: number; tipo: string; severidade: "info" | "aviso" | "critico"; mensagem: string; dados: Record<string, unknown> | null; criadoEm: Date }[],
    chaves: [] as { id: string; tipo: "instalacao" | "adocao"; prefixo: string; expiraEm: Date; usadaEm: Date | null; revogadaEm: Date | null; criadoEm: Date; criadoPor: string }[],
    versoes: ["0.7.0", "0.6.1"],
  };
  const dados: DadosLicenca = {
    hermesLicenca: { independeFinanceiro: true, renovacaoDias: 30, bloqueioManual: false, diasConfianca: 0 },
    contrato: null,
    modoPanico: false,
    maxDiasConfianca: 7,
    ...over.dados,
  };
  const deps: DepsLeituraPainel = {
    agora: () => new Date(AGORA),
    async instalacoes() {
      return m.instalacoes;
    },
    async instalacao(id) {
      return m.instalacoes.find((i) => i.id === id) ?? null;
    },
    async eventos() {
      return m.eventos;
    },
    async chavesDaInstalacao() {
      return m.chaves;
    },
    async versoesAgente() {
      return m.versoes;
    },
    async dadosLicenca(clienteId) {
      m.dadosChamadas.push(clienteId);
      return dados;
    },
    async configEnforcement(): Promise<ConfigEnforcement> {
      return { enforcementAtivo: m.enforcementAtivo, offlineHoras: 72 };
    },
    async lerEnforcement(): Promise<EnforcementHermes> {
      return m.enforcementAtivo ? montarEnforcement({ ativo: true, por: "Ana" }, AGORA) : { ativo: false, ligado_em: null, ligado_por: null, motivo: null };
    },
  };
  return { m, deps };
}

type Chave = Parameters<DepsEscritaPainel["inserirChave"]>[0];

function mundoEscrita(over: { cliente?: Partial<NonNullable<Awaited<ReturnType<DepsEscritaPainel["cliente"]>>>> | null; prova?: boolean } = {}) {
  const m = {
    auditoria: [] as { acao: string; entidadeId?: string; detalhes?: Record<string, unknown> }[],
    chavesInseridas: [] as Chave[],
    revogadas: [] as string[],
    canais: [] as { id: string; canal: string }[],
    pins: [] as { servidorId: string; versao: string | null }[],
    enforcementGravado: [] as EnforcementHermes[],
    cliente: over.cliente === null ? null : { id: CLIENTE, nome: "Mercado Teste", documento: CNPJ_OK, status: "ativo", ...over.cliente },
    instalacaoAdocao: { id: INSTALACAO, clienteId: CLIENTE, servidorId: null as string | null, status: "aguardando_ativacao" } as
      | { id: string; clienteId: string; servidorId: string | null; status: string }
      | null,
    instalacaoSimples: { id: INSTALACAO, status: "ativa", canal: "stable" as "stable" | "preview", servidorId: SERVIDOR, nome: "Mercado Teste" } as
      | { id: string; status: string; canal: "stable" | "preview"; servidorId: string | null; nome: string }
      | null,
    versaoAlvo: null as string | null,
    versoesExistentes: new Set(["0.7.0", "0.6.1"]),
    /** Chaves no "banco" (só as que o teste semeia); o fake de revogação reproduz a guarda do SQL. */
    chavesNoBanco: [{ id: CHAVE_ABERTA, prefixo: "hmk_Zz9a", tipo: "instalacao" as "instalacao" | "adocao", clienteId: CLIENTE, usadaEm: null as Date | null, revogadaEm: null as Date | null }],
    /** Instalações de adoção sem servidor (órfãs) que o "banco" já tem; o fake reaproveita como o repo. */
    orfasNoBanco: [] as { id: string; clienteId: string; criadaEm: number; canal: "stable" | "preview" }[],
    provaInstalacoes: [{ id: INSTALACAO, nome: "Mercado Teste", status: "ativa", saude: over.prova ? { chave_configurada: true } : { container: "rodando" } }] as {
      id: string;
      nome: string;
      status: string;
      saude: Record<string, unknown> | null;
    }[],
    enforcement: { ativo: false, ligado_em: null, ligado_por: null, motivo: null } as EnforcementHermes,
    instalacoesCriadas: 0,
    instalacoesReaproveitadas: [] as string[],
  };

  const deps: DepsEscritaPainel = {
    agora: () => new Date(AGORA),
    async auditar(a) {
      m.auditoria.push(a);
    },
    async cliente() {
      return m.cliente;
    },
    async instalacaoParaAdocao() {
      return m.instalacaoAdocao;
    },
    // Reproduz o CONTRATO do repo (hermes-painel-repo.ts, provado no SQL pelo script de integração, casos 1k-1m):
    // `criarInstalacao` => reaproveita a órfã mais recente do MESMO cliente; só cria se não houver.
    async inserirChave(d) {
      m.chavesInseridas.push(d);
      let instalacaoId = d.instalacaoId;
      let instalacaoCriada = false;
      if (d.criarInstalacao) {
        const orfa = m.orfasNoBanco.filter((o) => o.clienteId === d.clienteId).sort((a, b) => b.criadaEm - a.criadaEm)[0];
        if (orfa) {
          orfa.canal = d.criarInstalacao.canal;
          m.instalacoesReaproveitadas.push(orfa.id);
          instalacaoId = orfa.id;
        } else {
          instalacaoId = `i-novo-${++m.instalacoesCriadas}`;
          instalacaoCriada = true;
          m.orfasNoBanco.push({ id: instalacaoId, clienteId: d.clienteId, criadaEm: m.orfasNoBanco.length + 1, canal: d.criarInstalacao.canal });
        }
      }
      return { id: "k-1", instalacaoId, instalacaoCriada };
    },
    // Reproduz a guarda do SQL: `WHERE id = $1 AND usada_em IS NULL AND revogada_em IS NULL`.
    async revogarChaveAberta(id, _por, agora) {
      const c = m.chavesNoBanco.find((x) => x.id === id);
      if (!c || c.usadaEm || c.revogadaEm) return null;
      c.revogadaEm = agora;
      m.revogadas.push(id);
      return { prefixo: c.prefixo, tipo: c.tipo, clienteId: c.clienteId };
    },
    async instalacaoSimples() {
      return m.instalacaoSimples;
    },
    async atualizarCanal(id, canal) {
      m.canais.push({ id, canal });
    },
    async versaoAlvoServidor() {
      return m.versaoAlvo;
    },
    async versaoAgenteExiste(v) {
      return m.versoesExistentes.has(v);
    },
    async fixarVersaoAlvo(servidorId, versao) {
      m.pins.push({ servidorId, versao });
    },
    async instalacoesParaProva() {
      return m.provaInstalacoes;
    },
    async lerEnforcement() {
      return m.enforcement;
    },
    async gravarEnforcement(e) {
      m.enforcementGravado.push(e);
      m.enforcement = e;
    },
  };
  return { m, deps };
}

// ── leitura ─────────────────────────────────────────────────────────────────

describe("visaoGeralPainel", () => {
  it("monta a linha com licença derivada, servidor online e saúde sem vazar o controle de clone", async () => {
    const { deps } = mundoLeitura();
    const v = await visaoGeralPainel(deps);
    expect(v.linhas).toHaveLength(1);
    const l = v.linhas[0];
    expect(l).toMatchObject({
      id: INSTALACAO,
      clienteNome: "Mercado Teste",
      statusServidor: "online",
      canal: "stable",
      versao: "0.14.27",
      saude: { container: "rodando", saude: "saudavel", relogioConfiavel: true, agenteVersao: "0.7.0" },
      licenca: { status: "ativa", bloqueante: false, modo: "simulacao" },
      chaveConfigurada: null,
    });
    expect(JSON.stringify(l)).not.toContain("_controle");
    expect(v.enforcement.ativo).toBe(false);
  });

  it("modo vira valendo com enforcement global ligado, e fica simulacao com a exceção da instalação", async () => {
    const { deps } = mundoLeitura({
      enforcementAtivo: true,
      instalacoes: [bruta(), bruta({ id: "i2", servidorId: "s2", enforcement: "simular" })],
    });
    const v = await visaoGeralPainel(deps);
    expect(v.linhas.map((l) => l.licenca.modo)).toEqual(["valendo", "simulacao"]);
  });

  it("carência e bloqueio aparecem na licença; instalação revogada é bloqueante", async () => {
    const { deps } = mundoLeitura({ instalacoes: [bruta({ status: "revogada" })] });
    const v = await visaoGeralPainel(deps);
    expect(v.linhas[0].licenca).toMatchObject({ status: "revogada", bloqueante: true });
  });

  it("servidor sem contato recente fica offline; sem servidor, statusServidor é null", async () => {
    const { deps } = mundoLeitura({
      instalacoes: [
        bruta({ servidorUltimoContatoEm: new Date(AGORA.getTime() - 3600_000) }),
        bruta({ id: "i2", servidorId: null, servidorNome: null, servidorStatus: null, servidorUltimoContatoEm: null, status: "aguardando_ativacao" }),
      ],
    });
    const v = await visaoGeralPainel(deps);
    expect(v.linhas.map((l) => l.statusServidor)).toEqual(["offline", null]);
  });

  it("consulta os dados de licença UMA vez por cliente", async () => {
    const { deps, m } = mundoLeitura({
      instalacoes: [bruta(), bruta({ id: "i2", servidorId: "s2" }), bruta({ id: "i3", clienteId: OUTRO_CLIENTE, servidorId: "s3" })],
    });
    await visaoGeralPainel(deps);
    expect(m.dadosChamadas.sort()).toEqual([CLIENTE, OUTRO_CLIENTE].sort());
  });

  it("prontidão: sem chave_configurada na frota, não pode passar a valer", async () => {
    const { deps } = mundoLeitura();
    const v = await visaoGeralPainel(deps);
    expect(v.prontidao.pode).toBe(false);
    expect(v.prontidao.motivo).toMatch(/chave_configurada/);
  });

  it("prontidão libera com prova e conta quantas instalações já ficariam bloqueadas ao valer", async () => {
    const { deps } = mundoLeitura({
      dados: { hermesLicenca: { independeFinanceiro: false, renovacaoDias: 30, bloqueioManual: true, diasConfianca: 0 } },
      instalacoes: [
        bruta({ saude: { chave_configurada: true } }),
        bruta({ id: "i2", servidorId: "s2", saude: { chave_configurada: true }, enforcement: "simular" }),
      ],
    });
    const v = await visaoGeralPainel(deps);
    expect(v.prontidao.pode).toBe(true);
    // a 1ª está bloqueada manualmente e herda o enforcement; a 2ª é exceção "simular"
    expect(v.bloqueariamAoValer).toBe(1);
    expect(v.linhas[0].chaveConfigurada).toBe(true);
  });
});

describe("detalheInstalacaoPainel", () => {
  it("null quando a instalação não existe", async () => {
    const { deps } = mundoLeitura({ instalacoes: [] });
    expect(await detalheInstalacaoPainel(INSTALACAO, deps)).toBeNull();
  });

  it("traz eventos, alertas de clone, chaves e versões sem expor segredos", async () => {
    const { deps, m } = mundoLeitura({ instalacoes: [bruta({ cloneSuspeitoEm: new Date("2026-11-23T10:00:00.000Z"), servidorVersaoAlvo: "0.6.1" })] });
    m.eventos.push(
      { id: 2, tipo: "hermes_clone_suspeito", severidade: "critico", mensagem: "Possível clone de instalação (boot_alternando).", dados: { motivo: "boot_alternando" }, criadoEm: new Date("2026-11-23T10:00:00.000Z") },
      { id: 1, tipo: "hermes_update_ok", severidade: "info", mensagem: "ok", dados: null, criadoEm: new Date("2026-11-22T10:00:00.000Z") }
    );
    m.chaves.push({ id: "k1", tipo: "instalacao", prefixo: "hmk_abcd", expiraEm: new Date("2026-11-20T21:00:00.000Z"), usadaEm: new Date("2026-11-20T09:30:00.000Z"), revogadaEm: null, criadoEm: new Date("2026-11-20T09:00:00.000Z"), criadoPor: "Ana" });
    const d = await detalheInstalacaoPainel(INSTALACAO, deps);
    expect(d).not.toBeNull();
    expect(d!.eventos).toHaveLength(2);
    expect(d!.alertasClone).toEqual([{ id: 2, motivo: "boot_alternando", em: "2026-11-23T10:00:00.000Z" }]);
    expect(d!.chaves[0]).toMatchObject({ prefixo: "hmk_abcd", situacao: "usada" });
    expect(d!.versaoAlvoAgente).toBe("0.6.1");
    expect(d!.versoesAgente).toEqual(["0.7.0", "0.6.1"]);
    expect(d!.linha.cloneSuspeitoEm).toBe("2026-11-23T10:00:00.000Z");
    expect(JSON.stringify(d)).not.toMatch(/token_hash|tokenHash/);
  });
});

// ── chaves ──────────────────────────────────────────────────────────────────

describe("gerarChavePainel", () => {
  let w: ReturnType<typeof mundoEscrita>;
  beforeEach(() => {
    w = mundoEscrita();
  });

  it("instalação: chave hmk_ válida, só o hash e o prefixo guardados, 12 h, auditoria sem a chave", async () => {
    const r = await gerarChavePainel({ tipo: "instalacao", clienteId: CLIENTE, canal: "preview", por: "Ana" }, w.deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(formatoChaveValido(r.chave)).toBe(true);
    expect(r.expiraEm).toBe(new Date(AGORA.getTime() + 12 * 3600_000).toISOString());
    const guardada = w.m.chavesInseridas[0];
    expect(guardada).toMatchObject({
      tipo: "instalacao",
      clienteId: CLIENTE,
      cnpj: "11222333000181",
      canalInicial: "preview",
      prefixo: r.chave.slice(0, 8),
      instalacaoId: null,
      criarInstalacao: null,
      por: "Ana",
    });
    expect(guardada.hash).toBe(hashChaveHermes(r.chave));
    expect(JSON.stringify(guardada)).not.toContain(r.chave);
    expect(w.m.auditoria).toHaveLength(1);
    expect(w.m.auditoria[0]).toMatchObject({ acao: "hermes.chave_emitida", entidadeId: "k-1" });
    expect(w.m.auditoria[0].detalhes).toMatchObject({ tipo: "instalacao", prefixo: r.chave.slice(0, 8), cliente_id: CLIENTE, canal: "preview" });
    expect(JSON.stringify(w.m.auditoria)).not.toContain(r.chave);
  });

  it("adoção sem instalação informada: pede a criação da instalação e vale 24 h", async () => {
    const r = await gerarChavePainel({ tipo: "adocao", clienteId: CLIENTE, canal: "stable", por: "Ana" }, w.deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.expiraEm).toBe(new Date(AGORA.getTime() + 24 * 3600_000).toISOString());
    expect(w.m.chavesInseridas[0]).toMatchObject({ tipo: "adocao", instalacaoId: null, criarInstalacao: { nome: "Mercado Teste", canal: "stable" } });
    expect(w.m.auditoria[0].detalhes).toMatchObject({ tipo: "adocao", instalacao_criada: true });
  });

  it("adoção sem instalação informada, com ÓRFÃ do mesmo cliente: reaproveita a mais recente, não cria outra", async () => {
    w.m.orfasNoBanco.push(
      { id: "orfa-antiga", clienteId: CLIENTE, criadaEm: 1, canal: "stable" },
      { id: "orfa-recente", clienteId: CLIENTE, criadaEm: 2, canal: "stable" },
      { id: "orfa-outro-cliente", clienteId: OUTRO_CLIENTE, criadaEm: 9, canal: "stable" }
    );
    const r = await gerarChavePainel({ tipo: "adocao", clienteId: CLIENTE, canal: "preview", por: "Ana" }, w.deps);
    expect(r).toMatchObject({ ok: true, instalacaoId: "orfa-recente" });
    expect(w.m.instalacoesCriadas).toBe(0);
    expect(w.m.instalacoesReaproveitadas).toEqual(["orfa-recente"]);
    expect(w.m.orfasNoBanco.find((o) => o.id === "orfa-recente")?.canal).toBe("preview"); // segue o canal escolhido agora
    expect(w.m.auditoria[0].detalhes).toMatchObject({ tipo: "adocao", instalacao_id: "orfa-recente", instalacao_criada: false });
  });

  it("reemitir/clicar duas vezes a adoção do mesmo cliente: UMA instalação só, as duas chaves apontam para ela", async () => {
    const a = await gerarChavePainel({ tipo: "adocao", clienteId: CLIENTE, canal: "stable", por: "Ana" }, w.deps);
    const b = await gerarChavePainel({ tipo: "adocao", clienteId: CLIENTE, canal: "stable", por: "Ana" }, w.deps);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(w.m.instalacoesCriadas).toBe(1);
    expect(b.instalacaoId).toBe(a.instalacaoId);
    expect(a.chave).not.toBe(b.chave);
    expect(w.m.auditoria.map((x) => x.detalhes?.instalacao_criada)).toEqual([true, false]);
  });

  it("chave de INSTALAÇÃO nunca cria nem reaproveita instalação", async () => {
    w.m.orfasNoBanco.push({ id: "orfa", clienteId: CLIENTE, criadaEm: 1, canal: "stable" });
    const r = await gerarChavePainel({ tipo: "instalacao", clienteId: CLIENTE, canal: "stable", por: "Ana" }, w.deps);
    expect(r).toMatchObject({ ok: true, instalacaoId: null });
    expect(w.m.instalacoesCriadas).toBe(0);
    expect(w.m.instalacoesReaproveitadas).toEqual([]);
    expect(w.m.auditoria[0].detalhes).not.toHaveProperty("instalacao_criada");
  });

  it("adoção de instalação existente do cliente, sem servidor: usa a instalação", async () => {
    const r = await gerarChavePainel({ tipo: "adocao", clienteId: CLIENTE, canal: "stable", instalacaoId: INSTALACAO, por: "Ana" }, w.deps);
    expect(r.ok).toBe(true);
    expect(w.m.chavesInseridas[0]).toMatchObject({ instalacaoId: INSTALACAO, criarInstalacao: null });
  });

  it.each([
    ["de outro cliente", { clienteId: OUTRO_CLIENTE }],
    ["que já tem servidor", { servidorId: SERVIDOR }],
    ["revogada", { status: "revogada" }],
    ["desinstalada", { status: "desinstalada" }],
  ])("adoção recusa instalação %s", async (_n, patch) => {
    w.m.instalacaoAdocao = { id: INSTALACAO, clienteId: CLIENTE, servidorId: null, status: "aguardando_ativacao", ...patch };
    const r = await gerarChavePainel({ tipo: "adocao", clienteId: CLIENTE, canal: "stable", instalacaoId: INSTALACAO, por: "Ana" }, w.deps);
    expect(r.ok).toBe(false);
    expect(w.m.chavesInseridas).toEqual([]);
    expect(w.m.auditoria).toEqual([]);
  });

  it("adoção recusa instalação inexistente", async () => {
    w.m.instalacaoAdocao = null;
    const r = await gerarChavePainel({ tipo: "adocao", clienteId: CLIENTE, canal: "stable", instalacaoId: INSTALACAO, por: "Ana" }, w.deps);
    expect(r).toMatchObject({ ok: false });
  });

  it.each([
    ["cliente inexistente", null],
    ["cliente arquivado", { status: "arquivado" }],
    ["cliente sem documento", { documento: null }],
    ["cliente com CNPJ inválido", { documento: "11.111.111/1111-11" }],
  ])("recusa %s, sem gravar nem auditar", async (_n, cliente) => {
    w = mundoEscrita({ cliente: cliente as never });
    const r = await gerarChavePainel({ tipo: "instalacao", clienteId: CLIENTE, canal: "stable", por: "Ana" }, w.deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.length).toBeGreaterThan(5);
    expect(w.m.chavesInseridas).toEqual([]);
    expect(w.m.auditoria).toEqual([]);
  });

  it("valida tipo, canal e id do cliente", async () => {
    expect((await gerarChavePainel({ tipo: "x" as never, clienteId: CLIENTE, canal: "stable", por: "Ana" }, w.deps)).ok).toBe(false);
    expect((await gerarChavePainel({ tipo: "instalacao", clienteId: CLIENTE, canal: "beta" as never, por: "Ana" }, w.deps)).ok).toBe(false);
    expect((await gerarChavePainel({ tipo: "instalacao", clienteId: "nao-uuid", canal: "stable", por: "Ana" }, w.deps)).ok).toBe(false);
    expect(w.m.chavesInseridas).toEqual([]);
  });

  it("duas emissões geram chaves diferentes", async () => {
    const a = await gerarChavePainel({ tipo: "instalacao", clienteId: CLIENTE, canal: "stable", por: "Ana" }, w.deps);
    const b = await gerarChavePainel({ tipo: "instalacao", clienteId: CLIENTE, canal: "stable", por: "Ana" }, w.deps);
    expect(a.ok && b.ok && a.chave !== b.chave).toBe(true);
  });
});

describe("revogarChavePainel", () => {
  const CHAVE = CHAVE_ABERTA;

  it("revoga a chave aberta e audita (prefixo, nunca a chave)", async () => {
    const w = mundoEscrita();
    const r = await revogarChavePainel({ chaveId: CHAVE, por: "Ana" }, w.deps);
    expect(r).toEqual({ ok: true });
    expect(w.m.chavesNoBanco[0].revogadaEm).toEqual(AGORA);
    expect(w.m.auditoria).toEqual([
      { acao: "hermes.chave_revogada", entidadeId: CHAVE, detalhes: { prefixo: "hmk_Zz9a", tipo: "instalacao", cliente_id: CLIENTE } },
    ]);
  });

  it("chave JÁ USADA não é revogada: falha controlada, nada muda e nada é auditado", async () => {
    const w = mundoEscrita();
    const usadaEm = new Date("2026-11-24T09:00:00.000Z");
    w.m.chavesNoBanco[0].usadaEm = usadaEm;
    const r = await revogarChavePainel({ chaveId: CHAVE, por: "Ana" }, w.deps);
    expect(r).toEqual({ ok: false, erro: "Esta chave já foi usada, revogada ou não existe." });
    expect(w.m.chavesNoBanco[0]).toMatchObject({ usadaEm, revogadaEm: null });
    expect(w.m.revogadas).toEqual([]);
    expect(w.m.auditoria).toEqual([]);
  });

  it("segunda revogação da mesma chave: falha, preserva a 1ª revogada_em e não audita de novo", async () => {
    const w = mundoEscrita();
    expect((await revogarChavePainel({ chaveId: CHAVE, por: "Ana" }, w.deps)).ok).toBe(true);
    const primeira = w.m.chavesNoBanco[0].revogadaEm;
    const r = await revogarChavePainel({ chaveId: CHAVE, por: "Bia" }, { ...w.deps, agora: () => new Date(AGORA.getTime() + 60_000) });
    expect(r.ok).toBe(false);
    expect(w.m.chavesNoBanco[0].revogadaEm).toBe(primeira);
    expect(w.m.revogadas).toEqual([CHAVE]);
    expect(w.m.auditoria).toHaveLength(1);
  });

  it("chave inexistente: erro e nenhuma auditoria", async () => {
    const w = mundoEscrita();
    const r = await revogarChavePainel({ chaveId: "11111111-1111-4111-8111-bbbbbbbbbbbb", por: "Ana" }, w.deps);
    expect(r.ok).toBe(false);
    expect(w.m.auditoria).toEqual([]);
  });

  it("id inválido não chega ao banco", async () => {
    const w = mundoEscrita();
    expect((await revogarChavePainel({ chaveId: "x", por: "Ana" }, w.deps)).ok).toBe(false);
    expect(w.m.revogadas).toEqual([]);
  });
});

// ── canal ───────────────────────────────────────────────────────────────────

describe("trocarCanalPainel", () => {
  it("troca stable -> preview, grava e audita de/para", async () => {
    const w = mundoEscrita();
    const r = await trocarCanalPainel({ instalacaoId: INSTALACAO, canal: "preview", por: "Ana" }, w.deps);
    expect(r).toMatchObject({ ok: true, mudou: true });
    expect(w.m.canais).toEqual([{ id: INSTALACAO, canal: "preview" }]);
    expect(w.m.auditoria).toEqual([
      { acao: "hermes.canal_alterado", entidadeId: INSTALACAO, detalhes: { de: "stable", para: "preview", nome: "Mercado Teste" } },
    ]);
  });

  it("mesmo canal: nada a fazer, sem escrita e sem auditoria", async () => {
    const w = mundoEscrita();
    const r = await trocarCanalPainel({ instalacaoId: INSTALACAO, canal: "stable", por: "Ana" }, w.deps);
    expect(r).toMatchObject({ ok: true, mudou: false });
    expect(w.m.canais).toEqual([]);
    expect(w.m.auditoria).toEqual([]);
  });

  it.each(["revogada", "desinstalada"])("recusa instalação %s", async (status) => {
    const w = mundoEscrita();
    w.m.instalacaoSimples = { id: INSTALACAO, status, canal: "stable", servidorId: SERVIDOR, nome: "x" };
    const r = await trocarCanalPainel({ instalacaoId: INSTALACAO, canal: "preview", por: "Ana" }, w.deps);
    expect(r.ok).toBe(false);
    expect(w.m.canais).toEqual([]);
  });

  it("canal inválido, id inválido e instalação inexistente", async () => {
    const w = mundoEscrita();
    expect((await trocarCanalPainel({ instalacaoId: INSTALACAO, canal: "beta" as never, por: "Ana" }, w.deps)).ok).toBe(false);
    expect((await trocarCanalPainel({ instalacaoId: "x", canal: "stable", por: "Ana" }, w.deps)).ok).toBe(false);
    w.m.instalacaoSimples = null;
    expect((await trocarCanalPainel({ instalacaoId: INSTALACAO, canal: "preview", por: "Ana" }, w.deps)).ok).toBe(false);
    expect(w.m.auditoria).toEqual([]);
  });
});

// ── enforcement global ──────────────────────────────────────────────────────

describe("definirEnforcementPainel", () => {
  it("passar a valer sem a frase: recusa e não grava", async () => {
    const w = mundoEscrita({ prova: true });
    const r = await definirEnforcementPainel({ alvo: "valendo", confirmacao: "valer", por: "Ana" }, w.deps);
    expect(r.ok).toBe(false);
    expect(w.m.enforcementGravado).toEqual([]);
    expect(w.m.auditoria).toEqual([]);
  });

  it("passar a valer sem prova de chave real: recusa mesmo com a frase certa (motivo do servidor)", async () => {
    const w = mundoEscrita({ prova: false });
    const r = await definirEnforcementPainel({ alvo: "valendo", confirmacao: "VALER HERMES", por: "Ana" }, w.deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/chave_configurada/);
    expect(w.m.enforcementGravado).toEqual([]);
    expect(w.m.auditoria).toEqual([]);
  });

  it("passar a valer com prova e frase: grava ativo, registra quem/quando/motivo e audita", async () => {
    const w = mundoEscrita({ prova: true });
    const r = await definirEnforcementPainel({ alvo: "valendo", confirmacao: " valer hermes ", motivo: "  frota atualizada  ", por: "Ana" }, w.deps);
    expect(r).toMatchObject({ ok: true, mudou: true, ativo: true });
    expect(w.m.enforcementGravado).toEqual([{ ativo: true, ligado_em: AGORA.toISOString(), ligado_por: "Ana", motivo: "frota atualizada" }]);
    expect(w.m.auditoria).toHaveLength(1);
    expect(w.m.auditoria[0]).toMatchObject({ acao: "hermes.enforcement_valendo" });
    expect(w.m.auditoria[0].detalhes).toMatchObject({ de: false, para: true, motivo: "frota atualizada", instalacoes_com_prova: 1, instalacoes_ativas: 1 });
  });

  it("voltar a simulação é SEMPRE possível: sem frase e sem prova", async () => {
    const w = mundoEscrita({ prova: false });
    w.m.enforcement = { ativo: true, ligado_em: "2026-11-24T10:00:00.000Z", ligado_por: "Ana", motivo: null };
    const r = await definirEnforcementPainel({ alvo: "simulacao", por: "Bia" }, w.deps);
    expect(r).toMatchObject({ ok: true, mudou: true, ativo: false });
    expect(w.m.enforcementGravado[0]).toMatchObject({ ativo: false, ligado_por: "Bia" });
    expect(w.m.auditoria[0]).toMatchObject({ acao: "hermes.enforcement_simulacao" });
    expect(w.m.auditoria[0].detalhes).toMatchObject({ de: true, para: false });
  });

  it("já no estado pedido: não grava nem audita", async () => {
    const w = mundoEscrita({ prova: true });
    const r = await definirEnforcementPainel({ alvo: "simulacao", por: "Ana" }, w.deps);
    expect(r).toMatchObject({ ok: true, mudou: false });
    expect(w.m.enforcementGravado).toEqual([]);
    expect(w.m.auditoria).toEqual([]);
  });

  it("alvo inválido é recusado", async () => {
    const w = mundoEscrita({ prova: true });
    expect((await definirEnforcementPainel({ alvo: "x" as never, por: "Ana" }, w.deps)).ok).toBe(false);
  });

  it("motivo muito longo é cortado em 200 caracteres", async () => {
    const w = mundoEscrita({ prova: true });
    await definirEnforcementPainel({ alvo: "valendo", confirmacao: "VALER HERMES", motivo: "m".repeat(500), por: "Ana" }, w.deps);
    expect(w.m.enforcementGravado[0].motivo).toHaveLength(200);
  });
});

// ── atualização ─────────────────────────────────────────────────────────────

describe("fixarVersaoAgentePainel (agente_alvo pelo pin do servidor)", () => {
  it("fixa uma versão publicada e audita de/para", async () => {
    const w = mundoEscrita();
    const r = await fixarVersaoAgentePainel({ instalacaoId: INSTALACAO, versao: "0.7.0", por: "Ana" }, w.deps);
    expect(r).toMatchObject({ ok: true, mudou: true });
    expect(w.m.pins).toEqual([{ servidorId: SERVIDOR, versao: "0.7.0" }]);
    expect(w.m.auditoria).toEqual([
      { acao: "hermes.agente_versao_fixada", entidadeId: INSTALACAO, detalhes: { servidor_id: SERVIDOR, de: null, para: "0.7.0", nome: "Mercado Teste" } },
    ]);
  });

  it("null volta ao automático (última estável)", async () => {
    const w = mundoEscrita();
    w.m.versaoAlvo = "0.6.1";
    const r = await fixarVersaoAgentePainel({ instalacaoId: INSTALACAO, versao: null, por: "Ana" }, w.deps);
    expect(r).toMatchObject({ ok: true, mudou: true });
    expect(w.m.pins).toEqual([{ servidorId: SERVIDOR, versao: null }]);
  });

  it("versão que não existe no painel de release é recusada", async () => {
    const w = mundoEscrita();
    const r = await fixarVersaoAgentePainel({ instalacaoId: INSTALACAO, versao: "9.9.9", por: "Ana" }, w.deps);
    expect(r.ok).toBe(false);
    expect(w.m.pins).toEqual([]);
    expect(w.m.auditoria).toEqual([]);
  });

  it("mesma versão já fixada: sem escrita e sem auditoria", async () => {
    const w = mundoEscrita();
    w.m.versaoAlvo = "0.7.0";
    const r = await fixarVersaoAgentePainel({ instalacaoId: INSTALACAO, versao: "0.7.0", por: "Ana" }, w.deps);
    expect(r).toMatchObject({ ok: true, mudou: false });
    expect(w.m.pins).toEqual([]);
  });

  it("instalação sem servidor (adoção pendente) ou inexistente", async () => {
    const w = mundoEscrita();
    w.m.instalacaoSimples = { id: INSTALACAO, status: "aguardando_ativacao", canal: "stable", servidorId: null, nome: "x" };
    expect((await fixarVersaoAgentePainel({ instalacaoId: INSTALACAO, versao: "0.7.0", por: "Ana" }, w.deps)).ok).toBe(false);
    w.m.instalacaoSimples = null;
    expect((await fixarVersaoAgentePainel({ instalacaoId: INSTALACAO, versao: "0.7.0", por: "Ana" }, w.deps)).ok).toBe(false);
    expect(w.m.pins).toEqual([]);
  });

  it("recusa instalação revogada/desinstalada", async () => {
    const w = mundoEscrita();
    w.m.instalacaoSimples = { id: INSTALACAO, status: "revogada", canal: "stable", servidorId: SERVIDOR, nome: "x" };
    expect((await fixarVersaoAgentePainel({ instalacaoId: INSTALACAO, versao: "0.7.0", por: "Ana" }, w.deps)).ok).toBe(false);
  });
});

describe("forcarAtualizacaoContainer (digest_alvo: sem suporte no servidor)", () => {
  it("devolve NAO_IMPLEMENTADO e não depende de nada: não há coluna nem serviço de digest_alvo", () => {
    const r = forcarAtualizacaoContainer({ instalacaoId: INSTALACAO });
    expect(r).toMatchObject({ ok: false, codigo: "NAO_IMPLEMENTADO" });
    expect(r.erro).toMatch(/digest_alvo/);
  });

  it("valida o id antes", () => {
    expect(forcarAtualizacaoContainer({ instalacaoId: "x" })).toMatchObject({ ok: false, codigo: "ENTRADA_INVALIDA" });
  });
});
