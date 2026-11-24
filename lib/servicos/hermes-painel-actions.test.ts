/**
 * Server Actions do painel do Hermes: permissão certa por ação, validação do formulário, ator real
 * na auditoria, chave em claro só no retorno (nunca auditada) e revalidação. A regra de negócio está
 * em hermes-painel.test.ts; aqui prova-se a cola (FormData -> serviço).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DepsEscritaPainel } from "./hermes-painel";

const CLIENTE = "33333333-3333-4333-8333-333333333333";
const INSTALACAO = "22222222-2222-4222-8222-222222222222";
const SERVIDOR = "11111111-1111-4111-8111-111111111111";
const CHAVE_ID = "55555555-5555-4555-8555-555555555555";

const estado = vi.hoisted(() => ({
  permissoesPedidas: [] as string[],
  negar: null as string | null,
  revalidados: [] as string[],
  auditoria: [] as { acao: string; detalhes?: Record<string, unknown> }[],
  atores: [] as string[],
  inseridas: [] as unknown[],
  canais: [] as string[],
  pins: [] as (string | null)[],
  enforcement: { ativo: false, ligado_em: null, ligado_por: null, motivo: null } as Record<string, unknown>,
  prova: false,
  pinAtual: null as string | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void estado.revalidados.push(p) }));
vi.mock("@/lib/auth", () => ({
  exigirPermissao: async (p: string) => {
    estado.permissoesPedidas.push(p);
    if (estado.negar === p) throw new Error("NEXT_REDIRECT");
    return { id: "u1", nome: "Ana Admin" };
  },
}));
vi.mock("@/lib/servicos/hermes-painel-runtime", () => ({
  depsEscritaPainel: (perfil: { nome: string }): DepsEscritaPainel => ({
    agora: () => new Date("2026-11-24T12:00:00.000Z"),
    async auditar(a) {
      estado.atores.push(perfil.nome);
      estado.auditoria.push(a);
    },
    async cliente() {
      return { id: CLIENTE, nome: "Mercado Teste", documento: "11.222.333/0001-81", status: "ativo" };
    },
    async instalacaoParaAdocao() {
      return null;
    },
    async inserirChave(d) {
      estado.inseridas.push(d);
      return { id: CHAVE_ID, instalacaoId: d.instalacaoId, instalacaoCriada: !!d.criarInstalacao };
    },
    async revogarChaveAberta() {
      return { prefixo: "hmk_Zz9a", tipo: "instalacao", clienteId: CLIENTE };
    },
    async instalacaoSimples() {
      return { id: INSTALACAO, status: "ativa", canal: "stable", servidorId: SERVIDOR, nome: "Mercado Teste" };
    },
    async atualizarCanal(_id, canal) {
      estado.canais.push(canal);
    },
    async versaoAlvoServidor() {
      return estado.pinAtual;
    },
    async versaoAgenteExiste(v) {
      return v === "0.7.0";
    },
    async fixarVersaoAlvo(_s, v) {
      estado.pins.push(v);
    },
    async instalacoesParaProva() {
      return [{ id: INSTALACAO, nome: "Mercado Teste", status: "ativa", saude: estado.prova ? { chave_configurada: true } : {} }];
    },
    async lerEnforcement() {
      return estado.enforcement as never;
    },
    async gravarEnforcement(e) {
      estado.enforcement = { ...e };
    },
  }),
}));

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  estado.permissoesPedidas = [];
  estado.negar = null;
  estado.revalidados = [];
  estado.auditoria = [];
  estado.atores = [];
  estado.inseridas = [];
  estado.canais = [];
  estado.pins = [];
  estado.enforcement = { ativo: false, ligado_em: null, ligado_por: null, motivo: null };
  estado.prova = false;
  estado.pinAtual = null;
});

const acoes = () => import("@/app/(app)/painel/hermes/actions");

describe("gerarChaveHermes (action)", () => {
  it("exige servidores.cadastrar, devolve a chave UMA vez e audita com o ator real, sem a chave", async () => {
    const a = await acoes();
    const r = await a.gerarChaveHermes({}, form({ tipo: "instalacao", clienteId: CLIENTE, canal: "stable" }));
    expect(estado.permissoesPedidas).toEqual(["servidores.cadastrar"]);
    expect(r.chave).toMatch(/^hmk_[A-Za-z0-9_-]{43}$/);
    expect(r.erro).toBeUndefined();
    expect(estado.atores).toEqual(["Ana Admin"]);
    expect(JSON.stringify(estado.auditoria)).not.toContain(r.chave!);
    expect(JSON.stringify(estado.inseridas)).not.toContain(r.chave!);
    expect(estado.revalidados).toContain("/painel/hermes/chaves");
  });

  it("sem permissão: nada é gerado (o redirect do exigirPermissao interrompe)", async () => {
    estado.negar = "servidores.cadastrar";
    const a = await acoes();
    await expect(a.gerarChaveHermes({}, form({ tipo: "instalacao", clienteId: CLIENTE, canal: "stable" }))).rejects.toThrow();
    expect(estado.inseridas).toEqual([]);
    expect(estado.auditoria).toEqual([]);
  });

  it("formulário inválido: erro em pt-BR, nada gravado", async () => {
    const a = await acoes();
    const r = await a.gerarChaveHermes({}, form({ tipo: "instalacao", clienteId: "", canal: "stable" }));
    expect(r.chave).toBeUndefined();
    expect(r.erro).toMatch(/inválid/i);
    expect(estado.inseridas).toEqual([]);
  });
});

describe("revogarChaveHermes (action)", () => {
  it("exige servidores.cadastrar, revoga, audita e revalida", async () => {
    const a = await acoes();
    const r = await a.revogarChaveHermes({}, form({ chaveId: CHAVE_ID }));
    expect(estado.permissoesPedidas).toEqual(["servidores.cadastrar"]);
    expect(r).toEqual({ ok: "Chave revogada." });
    expect(estado.auditoria.map((x) => x.acao)).toEqual(["hermes.chave_revogada"]);
    expect(estado.revalidados).toContain("/painel/hermes/chaves");
  });
});

describe("trocarCanalHermes (action)", () => {
  it("exige servidores.cadastrar e troca o canal", async () => {
    const a = await acoes();
    const r = await a.trocarCanalHermes({}, form({ instalacaoId: INSTALACAO, canal: "preview" }));
    expect(estado.permissoesPedidas).toEqual(["servidores.cadastrar"]);
    expect(r.ok).toMatch(/preview/);
    expect(estado.canais).toEqual(["preview"]);
    expect(estado.revalidados).toEqual(expect.arrayContaining(["/painel/hermes", `/painel/hermes/${INSTALACAO}`]));
  });

  it("canal inválido não grava", async () => {
    const a = await acoes();
    const r = await a.trocarCanalHermes({}, form({ instalacaoId: INSTALACAO, canal: "beta" }));
    expect(r.erro).toBeTruthy();
    expect(estado.canais).toEqual([]);
  });
});

describe("definirEnforcementHermes (action)", () => {
  it("exige plataforma.simulacao; sem prova de chave real recusa mesmo com a frase", async () => {
    const a = await acoes();
    const r = await a.definirEnforcementHermes({}, form({ alvo: "valendo", confirmacao: "VALER HERMES" }));
    expect(estado.permissoesPedidas).toEqual(["plataforma.simulacao"]);
    expect(r.erro).toMatch(/chave_configurada/);
    expect(estado.enforcement.ativo).toBe(false);
    expect(estado.auditoria).toEqual([]);
  });

  it("com prova e frase: passa a valer, audita com o ator e revalida o layout", async () => {
    estado.prova = true;
    const a = await acoes();
    const r = await a.definirEnforcementHermes({}, form({ alvo: "valendo", confirmacao: "VALER HERMES", motivo: "frota ok" }));
    expect(r.erro).toBeUndefined();
    expect(r.ok).toMatch(/valendo/i);
    expect(estado.enforcement).toMatchObject({ ativo: true, ligado_por: "Ana Admin", motivo: "frota ok" });
    expect(estado.auditoria.map((x) => x.acao)).toEqual(["hermes.enforcement_valendo"]);
    expect(estado.revalidados).toContain("/painel/hermes");
  });

  it("voltar a simulação não pede frase nem prova", async () => {
    estado.enforcement = { ativo: true, ligado_em: "x", ligado_por: "Ana", motivo: null };
    const a = await acoes();
    const r = await a.definirEnforcementHermes({}, form({ alvo: "simulacao" }));
    expect(r.erro).toBeUndefined();
    expect(estado.enforcement.ativo).toBe(false);
    expect(estado.auditoria.map((x) => x.acao)).toEqual(["hermes.enforcement_simulacao"]);
  });

  it("alvo desconhecido é recusado", async () => {
    const a = await acoes();
    expect((await a.definirEnforcementHermes({}, form({ alvo: "tanto-faz" }))).erro).toBeTruthy();
  });
});

describe("atualização forçada (actions)", () => {
  it("fixar versão do agente exige agente.forcar_update", async () => {
    const a = await acoes();
    const r = await a.fixarVersaoAgenteHermes({}, form({ instalacaoId: INSTALACAO, versao: "0.7.0" }));
    expect(estado.permissoesPedidas).toEqual(["agente.forcar_update"]);
    expect(r.ok).toMatch(/0\.7\.0/);
    expect(estado.pins).toEqual(["0.7.0"]);
    expect(estado.auditoria.map((x) => x.acao)).toEqual(["hermes.agente_versao_fixada"]);
  });

  it("versão vazia ou 'auto' volta ao automático", async () => {
    estado.pinAtual = "0.6.1";
    const a = await acoes();
    await a.fixarVersaoAgenteHermes({}, form({ instalacaoId: INSTALACAO, versao: "auto" }));
    expect(estado.pins).toEqual([null]);
  });

  it("forçar container: exige agente.forcar_update, devolve o aviso de não implementado e não grava nem audita", async () => {
    const a = await acoes();
    const r = await a.forcarAtualizacaoContainerHermes({}, form({ instalacaoId: INSTALACAO }));
    expect(estado.permissoesPedidas).toEqual(["agente.forcar_update"]);
    expect(r.erro).toMatch(/digest_alvo/);
    expect(estado.auditoria).toEqual([]);
    expect(estado.pins).toEqual([]);
  });
});
