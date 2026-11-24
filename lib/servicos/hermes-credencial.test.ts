import { describe, it, expect, vi, afterEach } from "vitest";

import { tratarCredencialHermes, type DepsCredencial } from "./hermes-credencial";
import { criarMundoAgente } from "./hermes-memoria";

const SENHA = "ghp_SEGREDO_QUE_NUNCA_PODE_VAZAR_123";
const CORPO_CRED = { pedido: "credencial" };
const cred = () => ({ usuario: "rvland-pull", token: SENHA });

function montar(over: Parameters<typeof criarMundoAgente>[0] = {}, credencial: DepsCredencial["credencialRegistro"] = cred) {
  const m = criarMundoAgente(over);
  const deps: DepsCredencial = { ...m.deps, credencialRegistro: credencial };
  // pedido da rota `credencial`: assinatura do domínio `hermes:credencial:` e corpo {"pedido":"credencial"}
  const pedido = (corpo: unknown = CORPO_CRED, o: Parameters<typeof m.pedido>[1] = {}) =>
    m.pedido(corpo, { rota: "credencial", ...o });
  return { ...m, deps, pedido };
}

afterEach(() => vi.restoreAllMocks());

describe("POST /api/agente/hermes/credencial", () => {
  it("401 sem assinatura válida, 409 RELOGIO e 404 SEM_INSTALACAO (mesma autenticação do sync)", async () => {
    const { mundo, deps, pedido } = montar();
    expect((await tratarCredencialHermes({ ...pedido(), assinatura: "x" }, deps)).status).toBe(401);
    const r = await tratarCredencialHermes(pedido(undefined, { ts: new Date(mundo.agoraAtual.getTime() + 600_000) }), deps);
    expect(r).toMatchObject({ status: 409, corpo: { erro: "RELOGIO" } });
    const sem = montar({ semInstalacao: true });
    expect((await tratarCredencialHermes(sem.pedido(), sem.deps)).corpo).toEqual({ erro: "SEM_INSTALACAO" });
  });

  it("200 com repositório, registro, usuário, senha e expiração; sem cache", async () => {
    const { mundo, deps, pedido } = montar();
    const r = await tratarCredencialHermes(pedido(), deps);
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({
      repositorio: "ghcr.io/rvland-devs/hermes",
      registro: "ghcr.io",
      usuario: "rvland-pull",
      senha: SENHA,
      expira_em: new Date(mundo.agoraAtual.getTime() + 3600_000).toISOString(),
    });
    expect(r.headers?.["cache-control"]).toBe("no-store");
  });

  it("corpo obrigatório e estrito: só {\"pedido\":\"credencial\"}; vazio, {}, extra, outro valor e não-objeto são 422", async () => {
    const ok = montar();
    expect((await tratarCredencialHermes(ok.pedido(), ok.deps)).status).toBe(200);
    const ruins: unknown[] = [{}, { pedido: "outra" }, { pedido: "credencial", x: 1 }, [], "credencial", null];
    for (const corpo of ruins) {
      const m = montar();
      const r = await tratarCredencialHermes(m.pedido(corpo), m.deps);
      expect(r, JSON.stringify(corpo)).toMatchObject({ status: 422, corpo: { erro: "CORPO_INVALIDO" } });
    }
    const vazio = montar();
    expect((await tratarCredencialHermes(vazio.pedido(null, { corpoCru: "" }), vazio.deps)).status).toBe(422);
    const lixo = montar();
    expect((await tratarCredencialHermes(lixo.pedido(null, { corpoCru: "{nao-json" }), lixo.deps)).status).toBe(400);
  });

  it("separação de domínio: assinatura de sync não vale na credencial; heartbeat do Credit não vale em nenhuma rota", async () => {
    const m = montar();
    for (const rota of ["sync", "heartbeat"] as const) {
      const r = await tratarCredencialHermes(m.pedido(CORPO_CRED, { rota }), m.deps);
      expect(r, rota).toMatchObject({ status: 401, corpo: { erro: "AGENTE_NAO_AUTENTICADO" } });
    }
    expect(m.mundo.auditoria).toHaveLength(0);
  });

  it("a senha NUNCA aparece em log, auditoria nem resposta de erro", async () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    const ok = montar();
    await tratarCredencialHermes(ok.pedido(), ok.deps);
    const bloq = montar({ instalacao: { status: "revogada" } });
    const r403 = await tratarCredencialHermes(bloq.pedido(), bloq.deps);
    const sem = montar({}, () => null);
    const r503 = await tratarCredencialHermes(sem.pedido(), sem.deps);

    expect(JSON.stringify(ok.mundo.auditoria)).not.toContain(SENHA);
    expect(JSON.stringify(ok.mundo.auditoria)).not.toContain("rvland-pull");
    expect(JSON.stringify([r403, r503])).not.toContain(SENHA);
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(SENHA);
    expect(ok.mundo.telegrams.join()).not.toContain(SENHA);
  });

  it("audita a entrega (hermes.credencial_entregue) com a instalação, sem segredo", async () => {
    const { mundo, deps, pedido } = montar();
    await tratarCredencialHermes(pedido(), deps);
    expect(mundo.auditoria).toEqual([
      expect.objectContaining({ acao: "hermes.credencial_entregue", entidadeId: mundo.instalacao.id }),
    ]);
  });

  it("credencial_entregue grava status, modo e negaria_se_valendo (simulação com status bloqueante → true)", async () => {
    const semContrato = { hermesLicenca: null, contrato: null };
    const sim = montar({ dados: semContrato, config: { enforcementAtivo: false } });
    expect((await tratarCredencialHermes(sim.pedido(), sim.deps)).status).toBe(200);
    expect(sim.mundo.auditoria[0]).toMatchObject({
      acao: "hermes.credencial_entregue",
      detalhes: { servidor_id: sim.mundo.servidor.id, status: "sem_contrato", modo: "simulacao", negaria_se_valendo: true },
    });
    const ok = montar();
    await tratarCredencialHermes(ok.pedido(), ok.deps);
    expect(ok.mundo.auditoria[0].detalhes).toMatchObject({ status: "ativa", modo: "simulacao", negaria_se_valendo: false });
  });

  it("expiração do registro no passado (ou agora) nunca vira credencial já vencida: usa agora + 1 h", async () => {
    const m0 = criarMundoAgente();
    const passado = new Date(m0.mundo.agoraAtual.getTime() - 86_400_000);
    const m = montar({}, () => ({ ...cred(), expiraEm: passado }));
    const r = await tratarCredencialHermes(m.pedido(), m.deps);
    expect((r.corpo as { expira_em: string }).expira_em).toBe(new Date(m.mundo.agoraAtual.getTime() + 3600_000).toISOString());
    // exatamente agora também está vencida
    const n = montar({}, () => ({ ...cred(), expiraEm: new Date("2026-11-23T12:00:00.000Z") }));
    expect(((await tratarCredencialHermes(n.pedido(), n.deps)).corpo as { expira_em: string }).expira_em).toBe("2026-11-23T13:00:00.000Z");
  });

  it("expiração futura configurada é respeitada", async () => {
    const futuro = new Date("2026-12-01T00:00:00.000Z");
    const m = montar({}, () => ({ ...cred(), expiraEm: futuro }));
    expect(((await tratarCredencialHermes(m.pedido(), m.deps)).corpo as { expira_em: string }).expira_em).toBe(futuro.toISOString());
  });

  describe("403 INSTALACAO_BLOQUEADA", () => {
    const semContrato = { hermesLicenca: null, contrato: null };

    it("instalação revogada: sempre 403 (mesmo em simulação)", async () => {
      const { mundo, deps, pedido } = montar({ instalacao: { status: "revogada" } });
      const r = await tratarCredencialHermes(pedido(), deps);
      expect(r).toMatchObject({ status: 403, corpo: { erro: "INSTALACAO_BLOQUEADA" } });
      expect(mundo.auditoria[0]).toMatchObject({ acao: "hermes.credencial_negada" });
    });

    it("bloqueio manual do dono: sempre 403", async () => {
      const { deps, pedido } = montar({
        dados: { hermesLicenca: { independeFinanceiro: false, renovacaoDias: 30, bloqueioManual: true, diasConfianca: 0 } },
      });
      expect((await tratarCredencialHermes(pedido(), deps)).status).toBe(403);
    });

    it("status financeiro bloqueante (sem contrato): 403 só com enforcement valendo", async () => {
      const simulacao = montar({ dados: semContrato, config: { enforcementAtivo: false } });
      expect((await tratarCredencialHermes(simulacao.pedido(), simulacao.deps)).status).toBe(200);
      const valendo = montar({ dados: semContrato, config: { enforcementAtivo: true } });
      expect((await tratarCredencialHermes(valendo.pedido(), valendo.deps)).status).toBe(403);
      const excecao = montar({ dados: semContrato, config: { enforcementAtivo: true }, instalacao: { enforcement: "simular" } });
      expect((await tratarCredencialHermes(excecao.pedido(), excecao.deps)).status).toBe(200);
    });

    it("pânico global não bloqueia a credencial por falta de pagamento", async () => {
      const { deps, pedido } = montar({ dados: { ...semContrato, modoPanico: true }, config: { enforcementAtivo: true } });
      expect((await tratarCredencialHermes(pedido(), deps)).status).toBe(200);
    });
  });

  it("503 sem detalhe quando as variáveis do registro estão ausentes", async () => {
    const { deps, pedido } = montar({}, () => null);
    const r = await tratarCredencialHermes(pedido(), deps);
    expect(r).toMatchObject({ status: 503, corpo: { erro: "INDISPONIVEL" } });
    expect(JSON.stringify(r)).not.toMatch(/HERMES_REGISTRO|TOKEN|USUARIO/);
  });

  it("rate limit: 30 por hora por servidor, a 31ª é 429", async () => {
    const { mundo, deps, pedido } = montar();
    for (let i = 0; i < 30; i++) {
      mundo.agora = new Date(mundo.agoraAtual.getTime() + 1000);
      expect((await tratarCredencialHermes(pedido(), deps)).status).toBe(200);
    }
    mundo.agora = new Date(mundo.agoraAtual.getTime() + 1000);
    const r = await tratarCredencialHermes(pedido(), deps);
    expect(r).toMatchObject({ status: 429, corpo: { erro: "LIMITE" } });
  });
});
