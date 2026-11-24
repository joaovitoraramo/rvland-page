import { describe, it, expect } from "vitest";
import { assinar, gerarParEd25519 } from "@/lib/crypto/ed25519";
import { mensagemAssinada } from "@/lib/crypto/heartbeat-auth";
import { assinarPedidoHermes } from "@/lib/hermes/assinatura-agente";
import { hashChaveHermes } from "@/lib/hermes/chave";
import { foiCriadaPorChave } from "@/lib/hermes/origem-servidor";
import { ativarHermes, validarChaveHermes } from "./hermes-ativacao";
import { criarMundoPublico, CNPJ_CLIENTE, MACHINE_ID } from "./hermes-memoria";

const FP = { machine_id_hash: MACHINE_ID };
const body = (chave: string, o: Record<string, unknown> = {}) => JSON.stringify({ chave, cnpj: CNPJ_CLIENTE, fingerprint: FP, ...o });
const IP = "1.1.1.1";

describe("POST /api/hermes/ativacao/validar", () => {
  it("200 com tipo, nome, CNPJ mascarado, canal e expiração — sem consumir", async () => {
    const { mundo, deps, emitirChave } = criarMundoPublico();
    const chave = emitirChave({ canalInicial: "preview" });
    const r = await validarChaveHermes({ corpo: body(chave), ip: IP }, deps);
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({
      tipo: "instalacao",
      cliente_nome: "Mercado Teste",
      cnpj_mascarado: "11.222.333/****-**",
      canal: "preview",
      expira_em: new Date(mundo.agoraAtual.getTime() + 12 * 3600_000).toISOString(),
    });
    // validar de novo continua valendo: não consome
    expect((await validarChaveHermes({ corpo: body(chave), ip: IP }, deps)).status).toBe(200);
    expect([...mundo.chaves.values()][0].usadaEm).toBeNull();
  });

  describe("instalacao_id na resposta (chave de adoção)", () => {
    const INST = "0A1B2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D";

    it("adoção válida + CNPJ conferido: devolve instalacao_id (uuid minúsculo); sem consumir", async () => {
      const { mundo, deps, emitirChave } = criarMundoPublico();
      const chave = emitirChave({ tipo: "adocao", instalacaoId: INST });
      const r = await validarChaveHermes({ corpo: body(chave), ip: IP }, deps);
      expect(r.status).toBe(200);
      expect(r.corpo).toMatchObject({ tipo: "adocao", instalacao_id: INST.toLowerCase() });
      expect([...mundo.chaves.values()][0].usadaEm).toBeNull();
      // filial (mesma raiz) também conta como conferido
      const f = await validarChaveHermes({ corpo: body(chave, { cnpj: "11222333000262" }), ip: IP }, deps);
      expect((f.corpo as Record<string, unknown>).instalacao_id).toBe(INST.toLowerCase());
    });

    it("chave de instalação NUNCA traz instalacao_id (mesmo que o registro tenha o campo)", async () => {
      const { deps, emitirChave } = criarMundoPublico();
      const r = await validarChaveHermes({ corpo: body(emitirChave({ tipo: "instalacao", instalacaoId: INST })), ip: IP }, deps);
      expect(r.status).toBe(200);
      expect(r.corpo).not.toHaveProperty("instalacao_id");
    });

    it("adoção ainda sem instalação associada: omite o campo (não inventa)", async () => {
      const { deps, emitirChave } = criarMundoPublico();
      const r = await validarChaveHermes({ corpo: body(emitirChave({ tipo: "adocao", instalacaoId: null })), ip: IP }, deps);
      expect(r.status).toBe(200);
      expect(r.corpo).not.toHaveProperty("instalacao_id");
    });

    it("adoção sem CNPJ de referência (não conferido): 200 sem instalacao_id", async () => {
      const { mundo, deps, emitirChave } = criarMundoPublico();
      mundo.clientes.set("c1", { nome: "Mercado Teste", cnpj: null });
      const r = await validarChaveHermes({ corpo: body(emitirChave({ tipo: "adocao", instalacaoId: INST, cnpj: null })), ip: IP }, deps);
      expect(r.status).toBe(200);
      expect(r.corpo).not.toHaveProperty("instalacao_id");
    });

    it("chave inválida/expirada/usada/revogada ou CNPJ divergente: resposta uniforme, sem o id em lugar nenhum", async () => {
      const { mundo, deps, emitirChave } = criarMundoPublico();
      const antes = new Date(mundo.agoraAtual.getTime() - 5 * 3600_000);
      const mortas = [
        emitirChave({ tipo: "adocao", instalacaoId: INST, expiraEm: new Date(mundo.agoraAtual.getTime() - 1000) }),
        emitirChave({ tipo: "adocao", instalacaoId: INST, usadaEm: antes }),
        emitirChave({ tipo: "adocao", instalacaoId: INST, revogadaEm: new Date() }),
      ];
      for (const c of mortas) {
        const r = await validarChaveHermes({ corpo: body(c), ip: IP }, deps);
        expect(r).toEqual({ status: 401, corpo: { erro: "CHAVE_INVALIDA" } });
      }
      const viva = emitirChave({ tipo: "adocao", instalacaoId: INST });
      const div = await validarChaveHermes({ corpo: body(viva, { cnpj: "11444777000161" }), ip: IP }, deps);
      expect(div).toEqual({ status: 409, corpo: { erro: "CNPJ_DIVERGENTE" } });
      expect(JSON.stringify(div)).not.toContain(INST.toLowerCase());
    });

    it("reentrada (chave já usada, mesma máquina, < 30 min) NÃO devolve o id: só chave ainda não consumida", async () => {
      const { mundo, deps, emitirChave } = criarMundoPublico();
      const chave = emitirChave({
        tipo: "adocao",
        instalacaoId: INST,
        usadaEm: new Date(mundo.agoraAtual.getTime() - 60_000),
        usadaFingerprint: FP,
        resultadoInstalacaoId: INST,
      });
      const r = await validarChaveHermes({ corpo: body(chave), ip: IP }, deps);
      expect(r.status).toBe(200);
      expect(r.corpo).not.toHaveProperty("instalacao_id");
    });
  });

  it("401 CHAVE_INVALIDA IDÊNTICO para inexistente, expirada, usada, revogada e malformada", async () => {
    const { mundo, deps, emitirChave } = criarMundoPublico();
    const expirada = emitirChave({ expiraEm: new Date(mundo.agoraAtual.getTime() - 1000) });
    const usada = emitirChave({ usadaEm: new Date(mundo.agoraAtual.getTime() - 5 * 3600_000) });
    const revogada = emitirChave({ revogadaEm: new Date() });
    const respostas = [];
    for (const c of [expirada, usada, revogada, "hmk_" + "z".repeat(43), "lixo", ""]) {
      respostas.push(await validarChaveHermes({ corpo: body(c || "x"), ip: IP }, deps));
    }
    for (const r of respostas) expect(r).toEqual({ status: 401, corpo: { erro: "CHAVE_INVALIDA" } });
  });

  it("409 CNPJ_DIVERGENTE compara a RAIZ: filial passa, outra raiz diverge e vira solicitação 'suspeita'", async () => {
    const { mundo, deps, emitirChave } = criarMundoPublico();
    const chave = emitirChave();
    // filial (mesma raiz 11222333, outro sufixo) é aceita
    const filial = await validarChaveHermes({ corpo: body(chave, { cnpj: "11222333000262" }), ip: IP }, deps);
    expect(filial.status).toBe(200);
    // outra raiz
    const r = await validarChaveHermes({ corpo: body(chave, { cnpj: "11444777000161" }), ip: IP }, deps);
    expect(r).toEqual({ status: 409, corpo: { erro: "CNPJ_DIVERGENTE" } });
    expect(mundo.solicitacoes).toHaveLength(1);
    expect(mundo.solicitacoes[0]).toMatchObject({ cnpj: "11444777000161", status: "suspeita" });
    expect(mundo.telegrams).toHaveLength(1);
    expect(mundo.auditoria.some((a) => a.acao === "hermes.cnpj_divergente")).toBe(true);
    // não consumiu a chave
    expect([...mundo.chaves.values()][0].usadaEm).toBeNull();
  });

  it("sem CNPJ de referência (chave sem snapshot e cliente sem documento válido): aceita, mas marca 'suspeita' e audita", async () => {
    for (const documento of [null, "123", "12.34-5"]) {
      const { mundo, deps, emitirChave } = criarMundoPublico();
      mundo.clientes.set("c1", { nome: "Mercado Teste", cnpj: documento });
      const chave = emitirChave({ cnpj: null });
      const r = await validarChaveHermes({ corpo: body(chave), ip: IP }, deps);
      expect(r.status, String(documento)).toBe(200);
      expect(mundo.solicitacoes).toHaveLength(1);
      expect(mundo.solicitacoes[0]).toMatchObject({ cnpj: CNPJ_CLIENTE, status: "suspeita" });
      expect(mundo.solicitacoes[0].motivo).toContain("sem CNPJ de referência");
      expect(mundo.auditoria.map((a) => a.acao)).toContain("hermes.cnpj_sem_referencia");
      // ativar também passa (a chave é consumida) e continua suspeita
      const a = await ativarHermes({ corpo: body(chave), ip: IP }, deps);
      expect(a.status).toBe(200);
      expect(mundo.solicitacoes.every((s) => s.status === "suspeita")).toBe(true);
    }
  });

  it("com referência (snapshot da chave ou documento do cliente) não gera suspeita por falta de CNPJ", async () => {
    const a = criarMundoPublico();
    await validarChaveHermes({ corpo: body(a.emitirChave()), ip: IP }, a.deps); // snapshot na chave
    const b = criarMundoPublico();
    await validarChaveHermes({ corpo: body(b.emitirChave({ cnpj: null })), ip: IP }, b.deps); // documento do cliente
    expect(a.mundo.solicitacoes).toHaveLength(0);
    expect(b.mundo.solicitacoes).toHaveLength(0);
  });

  it("CNPJ informado inválido: 422 antes de consultar a chave", async () => {
    const { deps, emitirChave } = criarMundoPublico();
    const r = await validarChaveHermes({ corpo: body(emitirChave(), { cnpj: "123" }), ip: IP }, deps);
    expect(r).toMatchObject({ status: 422, corpo: { erro: "CNPJ_INVALIDO" } });
  });

  it("limite de 10 falhas por hora por IP: a 11ª tentativa (até com chave boa) é 429", async () => {
    const { deps, emitirChave } = criarMundoPublico();
    for (let i = 0; i < 10; i++) {
      expect((await validarChaveHermes({ corpo: body("hmk_" + "a".repeat(43)), ip: "8.8.8.8" }, deps)).status).toBe(401);
    }
    const r = await validarChaveHermes({ corpo: body(emitirChave()), ip: "8.8.8.8" }, deps);
    expect(r.status).toBe(429);
    // outro IP segue normal
    expect((await validarChaveHermes({ corpo: body(emitirChave()), ip: "8.8.4.4" }, deps)).status).toBe(200);
  });

  it("sucessos não contam como falha", async () => {
    const { deps, emitirChave } = criarMundoPublico();
    const chave = emitirChave();
    for (let i = 0; i < 15; i++) expect((await validarChaveHermes({ corpo: body(chave), ip: IP }, deps)).status).toBe(200);
  });
});

describe("POST /api/hermes/ativacao: instalar", () => {
  it("consome a chave, cria servidor pendente + instalação e devolve o token de enroll", async () => {
    const { mundo, deps, emitirChave } = criarMundoPublico();
    const chave = emitirChave({ canalInicial: "preview" });
    const r = await ativarHermes({ corpo: body(chave, { identificacao: { razao_social: "Mercado Teste" } }), ip: IP }, deps);
    expect(r.status).toBe(200);
    const c = r.corpo as { modo: string; instalacao_id: string; servidor_id: string; enroll_token: string; canal: string };
    expect(c).toMatchObject({ modo: "instalar", canal: "preview" });
    expect(c.enroll_token).toBe(mundo.tokensEnroll[0]);
    expect(mundo.servidores.get(c.servidor_id)?.status).toBe("pendente");
    expect(mundo.instalacoes).toHaveLength(1);
    const k = [...mundo.chaves.values()][0];
    expect(k.usadaEm).toEqual(mundo.agoraAtual);
    expect(k.resultadoInstalacaoId).toBe(c.instalacao_id);
    expect(mundo.auditoria.map((a) => a.acao).sort()).toEqual(["hermes.chave_usada", "hermes.instalacao_criada"]);
    // auditoria nunca carrega a chave nem o token de enroll
    expect(JSON.stringify(mundo.auditoria)).not.toContain(chave);
    expect(JSON.stringify(mundo.auditoria)).not.toContain(c.enroll_token);
  });

  it("CONSUMO ATÔMICO: duas ativações simultâneas da mesma chave (máquinas diferentes) → exatamente uma ok", async () => {
    const { mundo, deps, emitirChave } = criarMundoPublico();
    const chave = emitirChave();
    const [a, b] = await Promise.all([
      ativarHermes({ corpo: body(chave, { fingerprint: { machine_id_hash: "a".repeat(64) } }), ip: "1.1.1.1" }, deps),
      ativarHermes({ corpo: body(chave, { fingerprint: { machine_id_hash: "b".repeat(64) } }), ip: "2.2.2.2" }, deps),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
    expect(mundo.instalacoes).toHaveLength(1);
    expect(mundo.servidores.size).toBe(1);
  });

  it("chave já usada por OUTRA máquina: 401 genérico (sem revelar que existiu)", async () => {
    const { deps, emitirChave } = criarMundoPublico();
    const chave = emitirChave();
    await ativarHermes({ corpo: body(chave), ip: IP }, deps);
    const r = await ativarHermes({ corpo: body(chave, { fingerprint: { machine_id_hash: "f".repeat(64) } }), ip: IP }, deps);
    expect(r).toEqual({ status: 401, corpo: { erro: "CHAVE_INVALIDA" } });
  });

  it("reentrada idempotente: mesma chave + mesmo machine_id_hash em até 30 min devolve a MESMA instalação com token novo", async () => {
    const { mundo, deps, emitirChave } = criarMundoPublico();
    const chave = emitirChave();
    const a = await ativarHermes({ corpo: body(chave), ip: IP }, deps);
    mundo.agora = new Date(mundo.agoraAtual.getTime() + 29 * 60_000);
    const b = await ativarHermes({ corpo: body(chave), ip: IP }, deps);
    expect(b.status).toBe(200);
    const ca = a.corpo as { instalacao_id: string; servidor_id: string; enroll_token: string };
    const cb = b.corpo as { instalacao_id: string; servidor_id: string; enroll_token: string };
    expect(cb.instalacao_id).toBe(ca.instalacao_id);
    expect(cb.servidor_id).toBe(ca.servidor_id);
    expect(cb.enroll_token).not.toBe(ca.enroll_token);
    expect(mundo.instalacoes).toHaveLength(1);
  });

  it("reentrada AUDITA hermes.chave_reentrada (prefixo, instalação, servidor) e nunca o token nem a chave", async () => {
    const { mundo, deps, emitirChave } = criarMundoPublico();
    const chave = emitirChave();
    const a = await ativarHermes({ corpo: body(chave), ip: IP }, deps);
    mundo.auditoria.length = 0;
    mundo.agora = new Date(mundo.agoraAtual.getTime() + 5 * 60_000);
    const b = await ativarHermes({ corpo: body(chave), ip: IP }, deps);
    const ca = a.corpo as { instalacao_id: string; servidor_id: string };
    const cb = b.corpo as { enroll_token: string };
    const k = [...mundo.chaves.values()][0];
    expect(mundo.auditoria).toEqual([
      { acao: "hermes.chave_reentrada", entidadeId: k.id, detalhes: { prefixo: k.prefixo, instalacao_id: ca.instalacao_id, servidor_id: ca.servidor_id } },
    ]);
    expect(JSON.stringify(mundo.auditoria)).not.toContain(cb.enroll_token);
    expect(JSON.stringify(mundo.auditoria)).not.toContain(chave);
  });

  it("reentrada pela via da corrida (perdeu o consumo para a MESMA máquina) também audita", async () => {
    const { mundo, deps, emitirChave } = criarMundoPublico();
    const chave = emitirChave();
    const real = deps.repo.ativarInstalar;
    // a outra requisição (mesma máquina) consome a chave primeiro; esta perde o UPDATE atômico
    deps.repo.ativarInstalar = async (hash, agora, uso) => {
      await real(hash, agora, uso);
      return null;
    };
    const r = await ativarHermes({ corpo: body(chave), ip: IP }, deps);
    expect(r.status).toBe(200);
    expect(mundo.auditoria.filter((x) => x.acao === "hermes.chave_reentrada")).toHaveLength(1);
    expect(JSON.stringify(mundo.auditoria)).not.toContain((r.corpo as { enroll_token: string }).enroll_token);
  });

  it("reentrada fora dos 30 min, ou depois que o agente já se registrou: recusada", async () => {
    const { mundo, deps, emitirChave } = criarMundoPublico();
    const chave = emitirChave();
    const a = await ativarHermes({ corpo: body(chave), ip: IP }, deps);
    mundo.agora = new Date(mundo.agoraAtual.getTime() + 31 * 60_000);
    expect((await ativarHermes({ corpo: body(chave), ip: IP }, deps)).status).toBe(401);

    const w = criarMundoPublico();
    const chave2 = w.emitirChave();
    const a2 = await ativarHermes({ corpo: body(chave2), ip: IP }, w.deps);
    w.mundo.servidores.get((a2.corpo as { servidor_id: string }).servidor_id)!.status = "ativo"; // enroll concluído
    expect((await ativarHermes({ corpo: body(chave2), ip: IP }, w.deps)).status).toBe(401);
    expect(a.status).toBe(200);
  });

  it("chave expirada/revogada não ativa e não cria nada", async () => {
    const { mundo, deps, emitirChave } = criarMundoPublico();
    const exp = emitirChave({ expiraEm: new Date(mundo.agoraAtual.getTime() - 1) });
    const rev = emitirChave({ revogadaEm: new Date() });
    expect((await ativarHermes({ corpo: body(exp), ip: IP }, deps)).status).toBe(401);
    expect((await ativarHermes({ corpo: body(rev), ip: IP }, deps)).status).toBe(401);
    expect(mundo.instalacoes).toHaveLength(0);
  });

  it("CNPJ de outra raiz: 409, solicitação suspeita e a chave NÃO é queimada", async () => {
    const { mundo, deps, emitirChave } = criarMundoPublico();
    const chave = emitirChave();
    const r = await ativarHermes({ corpo: body(chave, { cnpj: "11444777000161" }), ip: IP }, deps);
    expect(r).toEqual({ status: 409, corpo: { erro: "CNPJ_DIVERGENTE" } });
    expect(mundo.solicitacoes[0].status).toBe("suspeita");
    expect([...mundo.chaves.values()][0].usadaEm).toBeNull();
    expect((await ativarHermes({ corpo: body(chave), ip: IP }, deps)).status).toBe(200);
  });

  it("exige machine_id_hash (422) e respeita o limite de falhas por IP", async () => {
    const { deps, emitirChave } = criarMundoPublico();
    const chave = emitirChave();
    expect((await ativarHermes({ corpo: JSON.stringify({ chave, cnpj: CNPJ_CLIENTE }), ip: IP }, deps)).status).toBe(422);
    for (let i = 0; i < 10; i++) await ativarHermes({ corpo: body("hmk_" + "q".repeat(43)), ip: "6.6.6.6" }, deps);
    expect((await ativarHermes({ corpo: body(chave), ip: "6.6.6.6" }, deps)).status).toBe(429);
  });

  it("só o hash fica no repositório (a chave em claro nunca é consultada nem guardada)", async () => {
    const { mundo, emitirChave } = criarMundoPublico();
    const chave = emitirChave();
    expect(mundo.chaves.has(hashChaveHermes(chave))).toBe(true);
    expect(JSON.stringify([...mundo.chaves.values()])).not.toContain(chave);
  });
});

describe("POST /api/hermes/ativacao: adotar", () => {
  const SERVIDOR = "44444444-4444-4444-8444-444444444444";

  function cenario() {
    const w = criarMundoPublico();
    const agente = gerarParEd25519();
    w.mundo.servidores.set(SERVIDOR, { id: SERVIDOR, clienteId: "c1", status: "ativo", agentePubkey: agente.publicaB64 });
    w.mundo.instalacoes.push({ id: "inst-1", servidorId: null, clienteId: "c1", canal: "stable", cnpj: CNPJ_CLIENTE, fingerprint: null });
    const chave = w.emitirChave({ tipo: "adocao", instalacaoId: "inst-1" });
    // "corpo" assinado = instalacao_id + "\n" + machine_id_hash (amarra a prova ao fingerprint da requisição)
    const prova = (ts = w.mundo.agoraAtual, instalacao = "inst-1", priv = agente.privadaB64, machine = MACHINE_ID) => ({
      servidor_id: SERVIDOR,
      timestamp: ts.toISOString(),
      assinatura: assinarPedidoHermes("ativacao", ts.toISOString(), `${instalacao}\n${machine}`, priv),
    });
    return { ...w, chave, agente, prova };
  }

  it("verifica a assinatura `hermes:ativacao:<ts>.<sha256(instalacao_id\\nmachine_id_hash)>` e vincula o servidor ativo", async () => {
    const { mundo, deps, chave, prova } = cenario();
    const r = await ativarHermes({ corpo: body(chave, { agente_existente: prova() }), ip: IP }, deps);
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ modo: "adotar", instalacao_id: "inst-1", servidor_id: SERVIDOR, canal: "stable" });
    expect(mundo.instalacoes[0].servidorId).toBe(SERVIDOR);
    expect(mundo.tokensEnroll).toHaveLength(0); // adoção não gera token de enroll
    expect(mundo.auditoria.map((a) => a.acao).sort()).toEqual(["hermes.chave_usada", "hermes.instalacao_adotada"]);
  });

  it("assinatura de outra instalação, de outra chave ou ausente: 401 e a chave não é consumida", async () => {
    const { mundo, deps, chave, prova } = cenario();
    const outra = gerarParEd25519();
    for (const ae of [prova(undefined, "inst-OUTRA"), prova(undefined, "inst-1", outra.privadaB64), undefined]) {
      const r = await ativarHermes({ corpo: body(chave, ae ? { agente_existente: ae } : {}), ip: `5.5.5.${Math.random() * 200 | 0}` }, deps);
      expect(r).toEqual({ status: 401, corpo: { erro: "CHAVE_INVALIDA" } });
    }
    expect([...mundo.chaves.values()][0].usadaEm).toBeNull();
  });

  it("assinaturas de OUTRO domínio não valem: `ativar:<instalacao>` do esquema antigo, heartbeat do Credit e rotas sync/credencial", async () => {
    const { mundo, deps, chave, agente } = cenario();
    const ts = mundo.agoraAtual.toISOString();
    const assinaturas = [
      assinar(mensagemAssinada(ts, "ativar:inst-1"), agente.privadaB64), // esquema antigo (heartbeat do Credit)
      assinar(mensagemAssinada(ts, "inst-1"), agente.privadaB64), // heartbeat do Credit sobre o id
      assinarPedidoHermes("sync", ts, `inst-1\n${MACHINE_ID}`, agente.privadaB64),
      assinarPedidoHermes("credencial", ts, `inst-1\n${MACHINE_ID}`, agente.privadaB64),
      assinarPedidoHermes("ativacao", ts, "inst-1", agente.privadaB64), // esquema anterior: só o instalacao_id
    ];
    for (const [i, assinatura] of assinaturas.entries()) {
      const ae = { servidor_id: SERVIDOR, timestamp: ts, assinatura };
      const r = await ativarHermes({ corpo: body(chave, { agente_existente: ae }), ip: `6.6.6.${i + 1}` }, deps);
      expect(r, String(i)).toEqual({ status: 401, corpo: { erro: "CHAVE_INVALIDA" } });
    }
    expect([...mundo.chaves.values()][0].usadaEm).toBeNull();
  });

  it("a prova está amarrada ao fingerprint: assinada para OUTRO machine_id_hash (ou só o instalacao_id) é recusada e não consome a chave", async () => {
    const { mundo, deps, chave, prova, agente } = cenario();
    const ts = mundo.agoraAtual.toISOString();
    const soInstalacao = { servidor_id: SERVIDOR, timestamp: ts, assinatura: assinarPedidoHermes("ativacao", ts, "inst-1", agente.privadaB64) };
    for (const [i, ae] of [prova(undefined, "inst-1", undefined, "e".repeat(64)), soInstalacao].entries()) {
      const r = await ativarHermes({ corpo: body(chave, { agente_existente: ae }), ip: `7.7.7.${i + 1}` }, deps);
      expect(r, String(i)).toEqual({ status: 401, corpo: { erro: "CHAVE_INVALIDA" } });
    }
    expect([...mundo.chaves.values()][0].usadaEm).toBeNull();
  });

  it("timestamp velho (> 5 min) na prova é recusado", async () => {
    const { mundo, deps, chave, prova } = cenario();
    const velho = new Date(mundo.agoraAtual.getTime() - 10 * 60_000);
    const r = await ativarHermes({ corpo: body(chave, { agente_existente: prova(velho) }), ip: IP }, deps);
    expect(r.status).toBe(401);
  });

  it("servidor de OUTRO cliente, inativo ou já vinculado a outra instalação: recusado", async () => {
    const a = cenario();
    a.mundo.servidores.get(SERVIDOR)!.clienteId = "outro";
    expect((await ativarHermes({ corpo: body(a.chave, { agente_existente: a.prova() }), ip: IP }, a.deps)).status).toBe(401);

    const b = cenario();
    b.mundo.servidores.get(SERVIDOR)!.status = "pendente";
    expect((await ativarHermes({ corpo: body(b.chave, { agente_existente: b.prova() }), ip: IP }, b.deps)).status).toBe(401);

    const c = cenario();
    c.mundo.instalacoes.push({ id: "inst-2", servidorId: SERVIDOR, clienteId: "c1", canal: "stable", cnpj: null, fingerprint: null });
    expect((await ativarHermes({ corpo: body(c.chave, { agente_existente: c.prova() }), ip: IP }, c.deps)).status).toBe(401);
  });

  it("instalação revogada ou desinstalada: adoção recusada (401) SEM consumir a chave", async () => {
    for (const status of ["revogada", "desinstalada"]) {
      const { mundo, deps, chave, prova } = cenario();
      mundo.instalacoes[0].status = status;
      const r = await ativarHermes({ corpo: body(chave, { agente_existente: prova() }), ip: IP }, deps);
      expect(r, status).toEqual({ status: 401, corpo: { erro: "CHAVE_INVALIDA" } });
      expect([...mundo.chaves.values()][0].usadaEm, status).toBeNull();
      expect(mundo.instalacoes[0].servidorId, status).toBeNull();
    }
    // controle: ativa/aguardando adota normalmente
    const ok = cenario();
    ok.mundo.instalacoes[0].status = "ativa";
    expect((await ativarHermes({ corpo: body(ok.chave, { agente_existente: ok.prova() }), ip: IP }, ok.deps)).status).toBe(200);
  });

  it("reentrada idempotente na adoção (mesma máquina, até 30 min) devolve o mesmo resultado", async () => {
    const { mundo, deps, chave, prova } = cenario();
    const a = await ativarHermes({ corpo: body(chave, { agente_existente: prova() }), ip: IP }, deps);
    mundo.agora = new Date(mundo.agoraAtual.getTime() + 10 * 60_000);
    const b = await ativarHermes({ corpo: body(chave, { agente_existente: prova(mundo.agoraAtual) }), ip: IP }, deps);
    expect(b).toEqual(a);
  });

  it("consumo atômico na adoção: duas simultâneas → uma só", async () => {
    const { deps, chave, prova } = cenario();
    const mk = (mid: string, ip: string) => ativarHermes({ corpo: body(chave, { fingerprint: { machine_id_hash: mid }, agente_existente: prova(undefined, "inst-1", undefined, mid) }), ip }, deps);
    const [x, y] = await Promise.all([mk("a".repeat(64), "1.1.1.1"), mk("b".repeat(64), "2.2.2.2")]);
    expect([x.status, y.status].sort()).toEqual([200, 401]);
  });
});

describe("servidor criado pela ativação Hermes é marcável (isolamento do Credit/Pic Price)", () => {
  it("instalação nova: a instalação nasce com criado_por `chave:<prefixo>`", async () => {
    const { mundo, deps, emitirChave } = criarMundoPublico();
    const chave = emitirChave();
    const r = await ativarHermes({ corpo: body(chave), ip: IP }, deps);
    expect(r.status).toBe(200);
    const servidorId = (r.corpo as { servidor_id: string }).servidor_id;
    const inst = mundo.instalacoes.find((i) => i.servidorId === servidorId)!;
    expect(foiCriadaPorChave(inst.criadoPor)).toBe(true);
    expect(inst.criadoPor).toBe(`chave:${[...mundo.chaves.values()][0].prefixo}`);
  });

  it("adoção NÃO marca o servidor existente (continua um servidor normal do Credit)", async () => {
    const w = criarMundoPublico();
    const agente = gerarParEd25519();
    w.mundo.servidores.set("55555555-5555-4555-8555-555555555555", { id: "55555555-5555-4555-8555-555555555555", clienteId: "c1", status: "ativo", agentePubkey: agente.publicaB64 });
    w.mundo.instalacoes.push({ id: "inst-1", servidorId: null, clienteId: "c1", canal: "stable", cnpj: CNPJ_CLIENTE, fingerprint: null, criadoPor: "painel" });
    const chave = w.emitirChave({ tipo: "adocao", instalacaoId: "inst-1" });
    const ts = w.mundo.agoraAtual.toISOString();
    const prova = { servidor_id: "55555555-5555-4555-8555-555555555555", timestamp: ts, assinatura: assinarPedidoHermes("ativacao", ts, `inst-1\n${MACHINE_ID}`, agente.privadaB64) };
    expect((await ativarHermes({ corpo: body(chave, { agente_existente: prova }), ip: IP }, w.deps)).status).toBe(200);
    expect(foiCriadaPorChave(w.mundo.instalacoes[0].criadoPor)).toBe(false);
  });
});
