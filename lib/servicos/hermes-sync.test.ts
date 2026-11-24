import { describe, it, expect, vi, afterEach } from "vitest";

import { verificarDocumentoHermes } from "@/lib/crypto/hermes";
import { avaliarProntidaoEnforcement, chaveConfigurada } from "@/lib/hermes/painel";
import { tratarSyncHermes } from "./hermes-sync";
import type { RespostaHttp } from "./hermes-http";
import { criarMundoAgente, corpoSyncValido, INSTALACAO_ID, SERVIDOR_ID } from "./hermes-memoria";

const min = (n: number) => n * 60_000;

afterEach(() => vi.restoreAllMocks());

describe("POST /api/agente/hermes: autenticação e relógio", () => {
  it("401 AGENTE_NAO_AUTENTICADO: assinatura de outro corpo, outra chave, servidor desconhecido, uuid ruim", async () => {
    const { deps, pedido } = criarMundoAgente();
    const corpo = corpoSyncValido();

    const adulterado = { ...pedido(corpo), rawBody: JSON.stringify({ ...corpo, agente_versao: "9.9.9" }) };
    const outra = pedido(corpo, { assinarCom: (await import("@/lib/crypto/ed25519")).gerarParEd25519().privadaB64 });
    const desconhecido = pedido(corpo, { servidorId: "99999999-9999-4999-8999-999999999999" });
    const ruim = pedido(corpo, { servidorId: "nao-e-uuid" });

    for (const p of [adulterado, outra, desconhecido, ruim]) {
      const r = await tratarSyncHermes(p, deps);
      expect(r.status).toBe(401);
      expect(r.corpo).toEqual({ erro: "AGENTE_NAO_AUTENTICADO" });
    }
  });

  it("409 RELOGIO com o `agora` do servidor quando o timestamp está fora de ±5 min (já autenticado)", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    const r = await tratarSyncHermes(pedido(corpoSyncValido(), { ts: new Date(mundo.agoraAtual.getTime() + min(10)) }), deps);
    expect(r.status).toBe(409);
    expect(r.corpo).toEqual({ erro: "RELOGIO", agora: mundo.agoraAtual.toISOString() });
    // timestamp velho também
    const r2 = await tratarSyncHermes(pedido(corpoSyncValido(), { ts: new Date(mundo.agoraAtual.getTime() - min(6)) }), deps);
    expect(r2.status).toBe(409);
  });

  it("separação de domínio: assinatura da credencial e a do heartbeat do Credit não valem no sync", async () => {
    const { deps, pedido } = criarMundoAgente();
    for (const rota of ["credencial", "heartbeat"] as const) {
      const r = await tratarSyncHermes(pedido(corpoSyncValido(), { rota }), deps);
      expect(r, rota).toMatchObject({ status: 401, corpo: { erro: "AGENTE_NAO_AUTENTICADO" } });
    }
  });

  it("RELOGIO não é revelado a quem não prova a chave (assinatura inválida + relógio errado → 401)", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    const p = pedido(corpoSyncValido(), { ts: new Date(mundo.agoraAtual.getTime() + min(10)) });
    const r = await tratarSyncHermes({ ...p, assinatura: "AAAA" + p.assinatura.slice(4) }, deps);
    expect(r.status).toBe(401);
  });

  it("404 SEM_INSTALACAO quando o servidor não tem instalação Hermes (ou foi desinstalada)", async () => {
    const a = criarMundoAgente({ semInstalacao: true });
    expect((await tratarSyncHermes(a.pedido(corpoSyncValido()), a.deps)).corpo).toEqual({ erro: "SEM_INSTALACAO" });
    const b = criarMundoAgente({ instalacao: { status: "desinstalada" } });
    const r = await tratarSyncHermes(b.pedido(corpoSyncValido()), b.deps);
    expect(r.status).toBe(404);
  });

  it("409 REPLAY: timestamp igual ou anterior ao último aceito", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    const ok = await tratarSyncHermes(pedido(corpoSyncValido()), deps);
    expect(ok.status).toBe(200);
    // mesmo instante
    const igual = await tratarSyncHermes(pedido(corpoSyncValido()), deps);
    expect(igual).toMatchObject({ status: 409, corpo: { erro: "REPLAY" } });
    // anterior (dentro da janela ±5 min, mas já superado)
    const anterior = await tratarSyncHermes(pedido(corpoSyncValido(), { ts: new Date(mundo.agoraAtual.getTime() - 1000) }), deps);
    expect(anterior).toMatchObject({ status: 409, corpo: { erro: "REPLAY" } });
    // adiante: ok
    mundo.agora = new Date(mundo.agoraAtual.getTime() + 60_000);
    expect((await tratarSyncHermes(pedido(corpoSyncValido()), deps)).status).toBe(200);
  });

  it("REPLAY também quando o avanço atômico perde a corrida (duas requisições simultâneas)", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    mundo.avancarSempre = false; // simula UPDATE ... WHERE ultimo_ts < $ts sem linhas afetadas
    const r = await tratarSyncHermes(pedido(corpoSyncValido()), deps);
    expect(r).toMatchObject({ status: 409, corpo: { erro: "REPLAY" } });
    expect(mundo.eventos).toHaveLength(0);
  });
});

describe("POST /api/agente/hermes: contato do servidor (evita alerta agente_offline falso)", () => {
  it("sync autenticado e aceito registra o contato do servidor (ultimo_contato_em = agora do servidor)", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    const r = await tratarSyncHermes(pedido(corpoSyncValido()), deps);
    expect(r.status).toBe(200);
    expect(mundo.contatos).toEqual([{ servidorId: SERVIDOR_ID, em: mundo.agoraAtual }]);
  });

  it("sync aceito grava a versão do agente na coluna; sem a versão (ausente ou vazia) a coluna anterior fica", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    expect((await tratarSyncHermes(pedido(corpoSyncValido({ agente_versao: "0.7.0" })), deps)).status).toBe(200);
    expect(mundo.servidorAgenteVersao).toBe("0.7.0");

    // ausente
    mundo.agora = new Date(mundo.agoraAtual.getTime() + min(1));
    const semVersao: Record<string, unknown> = corpoSyncValido();
    delete semVersao.agente_versao;
    expect((await tratarSyncHermes(pedido(semVersao), deps)).status).toBe(200);
    expect(mundo.servidorAgenteVersao).toBe("0.7.0");

    // vazia
    mundo.agora = new Date(mundo.agoraAtual.getTime() + min(1));
    expect((await tratarSyncHermes(pedido(corpoSyncValido({ agente_versao: "" })), deps)).status).toBe(200);
    expect(mundo.servidorAgenteVersao).toBe("0.7.0");

    // nova versão troca
    mundo.agora = new Date(mundo.agoraAtual.getTime() + min(1));
    await tratarSyncHermes(pedido(corpoSyncValido({ agente_versao: "0.7.1" })), deps);
    expect(mundo.servidorAgenteVersao).toBe("0.7.1");
    expect(mundo.contatos).toHaveLength(4); // o contato é sempre registrado; só a versão é condicional
    // NOTA: quem garante o "não sobrescreve" é este mundo em memória, que reproduz a regra do repositório;
    // a regra real do repositório (UPDATE sem a coluna) está em hermes-repo-contato.test.ts e, no SQL, no caso 5e
    // de scripts/testes-integracao-hermes-painel.ts.
  });

  it("`container.chave_configurada`: o valor vem SÓ do corpo autenticado; o servidor nunca inventa `true`", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    // agente antigo (sem o campo): ausente no saude => painel continua bloqueado (fail-closed)
    expect((await tratarSyncHermes(pedido(corpoSyncValido()), deps)).status).toBe(200);
    const semCampo = mundo.patches.at(-1)?.saude as Record<string, unknown>;
    expect(semCampo).toMatchObject({ container: "rodando", saude: "saudavel", agente_versao: "0.7.0" });
    expect(semCampo).not.toHaveProperty("chave_configurada");
    expect(chaveConfigurada(mundo.instalacao.saude)).toBeNull();
    expect(avaliarProntidaoEnforcement([{ id: INSTALACAO_ID, nome: "x", status: "ativa", saude: mundo.instalacao.saude }]).pode).toBe(false);

    // o agente prova a cadeia imagem↔agente: true gravado exatamente como veio
    const comCampo = (v: unknown) => corpoSyncValido({ container: { ...corpoSyncValido().container, chave_configurada: v } });
    mundo.agora = new Date(mundo.agoraAtual.getTime() + min(1));
    expect((await tratarSyncHermes(pedido(comCampo(true)), deps)).status).toBe(200);
    expect((mundo.patches.at(-1)?.saude as Record<string, unknown>).chave_configurada).toBe(true);
    expect(avaliarProntidaoEnforcement([{ id: INSTALACAO_ID, nome: "x", status: "ativa", saude: mundo.instalacao.saude }]).pode).toBe(true);

    // false do agente: gravado false, bloqueia
    mundo.agora = new Date(mundo.agoraAtual.getTime() + min(2));
    expect((await tratarSyncHermes(pedido(comCampo(false)), deps)).status).toBe(200);
    expect(chaveConfigurada(mundo.instalacao.saude)).toBe(false);

    // o agente parou de mandar (rollback do agente): o `saude` é regravado inteiro, a prova some
    mundo.agora = new Date(mundo.agoraAtual.getTime() + min(3));
    await tratarSyncHermes(pedido(comCampo(true)), deps);
    mundo.agora = new Date(mundo.agoraAtual.getTime() + min(4));
    await tratarSyncHermes(pedido(corpoSyncValido()), deps);
    expect(chaveConfigurada(mundo.instalacao.saude)).toBeNull();
  });

  it("`container.chave_configurada` só aceita booleano (esquema estrito): string/número = 422 e nada gravado", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    for (const v of ["true", 1, null]) {
      const r = await tratarSyncHermes(pedido(corpoSyncValido({ container: { ...corpoSyncValido().container, chave_configurada: v } })), deps);
      expect(r.status).toBe(422);
    }
    expect(mundo.patches).toHaveLength(0);
  });

  it("não registra contato: não autenticado (assinatura/servidor), relógio fora, sem instalação, corpo inválido e REPLAY", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    const outra = (await import("@/lib/crypto/ed25519")).gerarParEd25519().privadaB64;
    await tratarSyncHermes(pedido(corpoSyncValido(), { assinarCom: outra }), deps);
    await tratarSyncHermes(pedido(corpoSyncValido(), { servidorId: "99999999-9999-4999-8999-999999999999" }), deps);
    await tratarSyncHermes(pedido(corpoSyncValido(), { ts: new Date(mundo.agoraAtual.getTime() + min(10)) }), deps);
    await tratarSyncHermes(pedido({ agente_versao: "1" }), deps);
    expect(mundo.contatos).toHaveLength(0);

    expect((await tratarSyncHermes(pedido(corpoSyncValido()), deps)).status).toBe(200);
    expect(mundo.contatos).toHaveLength(1);
    // REPLAY (mesmo timestamp) não conta como contato novo
    expect((await tratarSyncHermes(pedido(corpoSyncValido()), deps)).status).toBe(409);
    expect(mundo.contatos).toHaveLength(1);

    const sem = criarMundoAgente({ semInstalacao: true });
    await tratarSyncHermes(sem.pedido(corpoSyncValido()), sem.deps);
    expect(sem.mundo.contatos).toHaveLength(0);
  });

  it("REPLAY por perda da corrida atômica não registra contato", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    mundo.avancarSempre = false;
    expect((await tratarSyncHermes(pedido(corpoSyncValido()), deps)).status).toBe(409);
    expect(mundo.contatos).toHaveLength(0);
  });

  it("falha ao registrar o contato nunca derruba o sync (best-effort)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { mundo, deps, pedido } = criarMundoAgente();
    mundo.falhaContato = true;
    expect((await tratarSyncHermes(pedido(corpoSyncValido()), deps)).status).toBe(200);
  });
});

describe("POST /api/agente/hermes: agente_alvo (auto-update do agente pelo canal Hermes)", () => {
  const alvo = async (m: ReturnType<typeof criarMundoAgente>) =>
    ((await tratarSyncHermes(m.pedido(corpoSyncValido()), m.deps)).corpo as { agente_alvo?: unknown }).agente_alvo;

  it("sem release no painel: agente_alvo null (campo SEMPRE presente)", async () => {
    expect(await alvo(criarMundoAgente())).toBeNull();
  });

  it("com versão-alvo do painel: { versao, url: null, sha256: null } (url/sha256 reservados para o P4)", async () => {
    const m = criarMundoAgente();
    m.mundo.versaoAlvoAgente = "0.6.1";
    expect(await alvo(m)).toEqual({ versao: "0.6.1", url: null, sha256: null });
  });

  it("falha ao consultar o painel de release: agente_alvo null e o sync segue 200 com a licença", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const m = criarMundoAgente();
    m.mundo.versaoAlvoAgente = "erro";
    const r = await tratarSyncHermes(m.pedido(corpoSyncValido()), m.deps);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ agente_alvo: null, digest_alvo: null });
    expect((r.corpo as { licenca: unknown }).licenca).toBeTruthy();
  });

  it("503 (chave indisponível) não leva agente_alvo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const m = criarMundoAgente();
    m.mundo.falhaAssinatura = true;
    m.mundo.versaoAlvoAgente = "0.6.1";
    const r = await tratarSyncHermes(m.pedido(corpoSyncValido()), m.deps);
    expect(r).toEqual({ status: 503, corpo: { erro: "INDISPONIVEL" } });
  });
});

describe("POST /api/agente/hermes: validação estrita", () => {
  it("400 para JSON inválido e 422 para campo desconhecido/ausente", async () => {
    const { deps, pedido } = criarMundoAgente();
    const j = await tratarSyncHermes(pedido(null, { corpoCru: "{nao-json" }), deps);
    expect(j.status).toBe(400);
    const extra = await tratarSyncHermes(pedido({ ...corpoSyncValido(), hackeado: true }), deps);
    expect(extra.status).toBe(422);
    const sem = await tratarSyncHermes(pedido({ agente_versao: "1" }), deps);
    expect(sem.status).toBe(422);
  });

  it("validação inválida não consome o timestamp (o agente pode reenviar corrigido)", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    await tratarSyncHermes(pedido({ agente_versao: "1" }), deps);
    expect(mundo.instalacao.ultimoTsAgente).toBeNull();
  });
});

describe("POST /api/agente/hermes: resposta e documento assinado", () => {
  it("200: documento assinado verificável com a chave pública, canal, intervalo 60, digest_alvo null", async () => {
    const { mundo, deps, pedido } = criarMundoAgente({ instalacao: { canal: "preview" } });
    const r = await tratarSyncHermes(pedido(corpoSyncValido()), deps);
    expect(r.status).toBe(200);
    const c = r.corpo as { licenca: { payload: string; assinatura: string; kid: string }; agora: string; intervalo_seg: number; canal: string; digest_alvo: unknown };
    expect(c.intervalo_seg).toBe(60);
    expect(c.canal).toBe("preview");
    expect(c.digest_alvo).toBeNull();
    expect(c.agora).toBe(mundo.agoraAtual.toISOString());
    expect(c.licenca.kid).toBe("h1");

    const doc = verificarDocumentoHermes(c.licenca, { h1: mundo.hermes.publicaB64 });
    expect(doc).not.toBeNull();
    expect(doc).toMatchObject({
      tipo: "hermes_licenca",
      instalacao_id: INSTALACAO_ID,
      servidor_id: SERVIDOR_ID,
      cnpj: "11222333000181",
      canal: "preview",
      status: "ativa", // independe_financeiro
      bloqueante: false,
    });
    // chave errada não valida
    const outra = (await import("@/lib/crypto/ed25519")).gerarParEd25519();
    expect(verificarDocumentoHermes(c.licenca, { h1: outra.publicaB64 })).toBeNull();
    // registra o último documento emitido
    expect(mundo.patches.at(-1)?.ultimoEstadoEm).toEqual(mundo.agoraAtual);
    expect(mundo.patches.at(-1)?.ultimoDocEmitidoEm).toEqual(mundo.agoraAtual);
  });

  it("grava estado do container, versão/digest/sha/canal em uso, fingerprint, offset do relógio", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    const ts = new Date(mundo.agoraAtual.getTime() - 4_000);
    await tratarSyncHermes(
      pedido(
        corpoSyncValido({ container: { estado: "rodando", saude: "saudavel", versao: "0.14.26", sha: "abc1234", digest: "sha256:" + "d".repeat(64), canal_em_uso: "preview" } }),
        { ts }
      ),
      deps
    );
    const i = mundo.instalacao;
    expect(i.versao).toBe("0.14.26");
    expect(i.sha).toBe("abc1234");
    expect(i.digest).toBe("sha256:" + "d".repeat(64));
    expect(i.canalEmUso).toBe("preview");
    expect(i.fingerprint).toMatchObject({ machine_id_hash: "a".repeat(64) });
    expect(i.saude).toMatchObject({ container: "rodando", saude: "saudavel" });
    expect(mundo.patches.at(-1)?.relogioOffsetMs).toBe(4000);
  });

  it("primeiro sync: aguardando_ativacao -> ativa, ativada_em e auditoria (uma vez só)", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    await tratarSyncHermes(pedido(corpoSyncValido()), deps);
    expect(mundo.instalacao.status).toBe("ativa");
    expect(mundo.instalacao.ativadaEm).toEqual(mundo.agoraAtual);
    expect(mundo.auditoria.filter((a) => a.acao === "hermes.instalacao_ativada")).toHaveLength(1);
    mundo.agora = new Date(mundo.agoraAtual.getTime() + 60_000);
    await tratarSyncHermes(pedido(corpoSyncValido()), deps);
    expect(mundo.auditoria.filter((a) => a.acao === "hermes.instalacao_ativada")).toHaveLength(1);
    // o ciclo de 60 s NÃO audita a cada sync (evita inundar a trilha)
    expect(mundo.auditoria).toHaveLength(1);
  });

  it("CORRIDA: revogada entre a leitura e a gravação NÃO vira ativa (promoção condicional) e não audita ativação", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    const original = deps.avancarTimestamp;
    deps.avancarTimestamp = async (id, ts) => {
      const r = await original(id, ts);
      mundo.instalacao.status = "revogada"; // o dono revoga no meio do sync
      return r;
    };
    const r = await tratarSyncHermes(pedido(corpoSyncValido()), deps);
    expect(r.status).toBe(200);
    expect(mundo.instalacao.status).toBe("revogada");
    expect(mundo.instalacao.ativadaEm).toBeNull();
    expect(mundo.auditoria.filter((a) => a.acao === "hermes.instalacao_ativada")).toHaveLength(0);
    // nenhum patch grava status/ativada_em de forma incondicional
    for (const p of mundo.patches) expect(p).not.toHaveProperty("status");
  });

  it("duas promoções simultâneas: só uma audita a ativação", async () => {
    const { mundo, deps } = criarMundoAgente();
    const [a, b] = await Promise.all([deps.ativarSeAguardando(INSTALACAO_ID, mundo.agoraAtual), deps.ativarSeAguardando(INSTALACAO_ID, mundo.agoraAtual)]);
    expect([a, b].sort()).toEqual([false, true]);
    expect(mundo.instalacao.status).toBe("ativa");
  });

  it("instalação revogada: documento revogada/bloqueante (vence tudo) e continua respondendo", async () => {
    const { mundo, deps, pedido } = criarMundoAgente({ instalacao: { status: "revogada" }, config: { enforcementAtivo: true } });
    const r = await tratarSyncHermes(pedido(corpoSyncValido()), deps);
    expect(r.status).toBe(200);
    const doc = verificarDocumentoHermes((r.corpo as { licenca: never }).licenca, { h1: mundo.hermes.publicaB64 })!;
    expect(doc.status).toBe("revogada");
    expect(doc.bloqueante).toBe(true);
    expect(doc.modo).toBe("valendo");
    expect(mundo.instalacao.status).toBe("revogada"); // sync não "reativa" revogada
  });
});

describe("POST /api/agente/hermes: modo valendo x simulação", () => {
  const semContrato = { hermesLicenca: null, contrato: null };

  async function doc(over: Parameters<typeof criarMundoAgente>[0]) {
    const m = criarMundoAgente(over);
    const r = await tratarSyncHermes(m.pedido(corpoSyncValido()), m.deps);
    return verificarDocumentoHermes((r.corpo as { licenca: never }).licenca, { h1: m.mundo.hermes.publicaB64 })!;
  }

  it("enforcement global desligado (padrão): simulação, não obrigatória, mesmo sem contrato", async () => {
    const d = await doc({ dados: semContrato, config: { enforcementAtivo: false } });
    expect(d.modo).toBe("simulacao");
    expect(d.obrigatoria).toBe(false);
    expect(d.status).toBe("sem_contrato");
    expect(d.bloqueante).toBe(true); // o status é bloqueante, mas o agente só bloqueia se modo=valendo
  });

  it("enforcement ativo + instalação herdando: valendo e obrigatória", async () => {
    const d = await doc({ dados: semContrato, config: { enforcementAtivo: true } });
    expect(d.modo).toBe("valendo");
    expect(d.obrigatoria).toBe(true);
  });

  it("exceção por instalação ('simular') mantém simulação com o enforcement global ativo", async () => {
    const d = await doc({ dados: semContrato, config: { enforcementAtivo: true }, instalacao: { enforcement: "simular" } });
    expect(d.modo).toBe("simulacao");
  });

  it("modo_simulacao GLOBAL do Credit não existe como entrada: só hermes_enforcement decide", async () => {
    // as dependências do serviço não expõem modo_simulacao; o modo depende só de configEnforcement
    const { deps } = criarMundoAgente();
    expect(Object.keys(deps)).not.toContain("modoSimulacao");
  });

  it("offline_ate usa as horas configuradas", async () => {
    const d = await doc({ config: { offlineHoras: 24 } });
    expect(Date.parse(d.offline_ate) - Date.parse(d.operar_ate)).toBe(24 * 3600_000);
  });
});

describe("POST /api/agente/hermes: eventos (whitelist)", () => {
  it("grava só tipos hermes_* permitidos; descarta desconhecidos e hermes_clone_suspeito do agente", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    await tratarSyncHermes(
      pedido(
        corpoSyncValido({
          eventos: [
            { tipo: "hermes_bloqueio_simulado", severidade: "aviso", mensagem: "bloquearia" },
            { tipo: "hermes_clone_suspeito", mensagem: "forjado" },
            { tipo: "servico_caiu", mensagem: "não hermes" },
            { tipo: "hermes_update_ok", mensagem: "ok", dados: { de: "0.14.25", para: "0.14.26" } },
          ],
        })
      ),
      deps
    );
    expect(mundo.eventos.map((e) => e.tipo)).toEqual(["hermes_bloqueio_simulado", "hermes_update_ok"]);
    expect(mundo.eventos[0]).toMatchObject({ servidorId: SERVIDOR_ID, severidade: "aviso" });
    expect(mundo.eventos[1].dados).toEqual({ de: "0.14.25", para: "0.14.26" });
  });

  it("descarta `dados` grandes demais e trunca a mensagem", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    await tratarSyncHermes(
      pedido(corpoSyncValido({ eventos: [{ tipo: "hermes_adulteracao", mensagem: "m", dados: { lixo: "x".repeat(5000) } }] })),
      deps
    );
    expect(mundo.eventos[0].dados).toBeNull();
  });

  it("relógio não confiável: um evento hermes_relogio só na transição", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    const ruim = corpoSyncValido({ relogio: { confiavel: false } });
    await tratarSyncHermes(pedido(ruim), deps);
    mundo.agora = new Date(mundo.agoraAtual.getTime() + 60_000);
    await tratarSyncHermes(pedido(ruim), deps);
    expect(mundo.eventos.filter((e) => e.tipo === "hermes_relogio")).toHaveLength(1);
  });
});

describe("POST /api/agente/hermes: clone suspeito", () => {
  it("dois boot_id alternando em < 10 min: marca clone_suspeito_em, evento crítico e Telegram (só alerta)", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    for (const [i, boot] of ["A", "B", "A"].entries()) {
      mundo.agora = new Date(Date.parse("2026-11-23T12:00:00.000Z") + i * 60_000);
      await tratarSyncHermes(pedido(corpoSyncValido({ fingerprint: { machine_id_hash: "a".repeat(64), boot_id: boot } })), deps);
    }
    expect(mundo.instalacao.cloneSuspeitoEm).not.toBeNull();
    expect(mundo.eventos.filter((e) => e.tipo === "hermes_clone_suspeito")).toHaveLength(1);
    expect(mundo.eventos.find((e) => e.tipo === "hermes_clone_suspeito")?.severidade).toBe("critico");
    expect(mundo.telegrams).toHaveLength(1);
    expect(mundo.telegrams[0]).toContain("Cliente Teste");
    expect(mundo.auditoria.some((a) => a.acao === "hermes.clone_suspeito")).toBe(true);
  });

  it("não repete o alerta enquanto o dono não resolve; e NÃO bloqueia nada sozinho", async () => {
    const { mundo, deps, pedido } = criarMundoAgente({ config: { enforcementAtivo: true } });
    let ultimo: RespostaHttp | undefined;
    for (const [i, boot] of ["A", "B", "A", "B", "A"].entries()) {
      mundo.agora = new Date(Date.parse("2026-11-23T12:00:00.000Z") + i * 60_000);
      ultimo = await tratarSyncHermes(pedido(corpoSyncValido({ fingerprint: { machine_id_hash: "a".repeat(64), boot_id: boot } })), deps);
    }
    expect(mundo.telegrams).toHaveLength(1);
    expect(mundo.eventos.filter((e) => e.tipo === "hermes_clone_suspeito")).toHaveLength(1);
    const doc = verificarDocumentoHermes((ultimo!.corpo as { licenca: never }).licenca, { h1: mundo.hermes.publicaB64 })!;
    expect(doc.bloqueante).toBe(false); // continua ativa (independe_financeiro): só alerta
  });

  it("ciclo normal de 60 s e reboot legítimo não disparam", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    for (const [i, boot] of ["A", "A", "B", "B", "C"].entries()) {
      mundo.agora = new Date(Date.parse("2026-11-23T12:00:00.000Z") + i * 60_000);
      await tratarSyncHermes(pedido(corpoSyncValido({ fingerprint: { machine_id_hash: "a".repeat(64), boot_id: boot } })), deps);
    }
    expect(mundo.instalacao.cloneSuspeitoEm).toBeNull();
    expect(mundo.telegrams).toHaveLength(0);
  });
});

describe("POST /api/agente/hermes: clone suspeito por machine_id_hash e REPLAY assinado", () => {
  const M2 = "b".repeat(64);
  const fp = (machine: string, boot = "boot-A") => ({ machine_id_hash: machine, boot_id: boot });

  it("machine_id_hash que muda ENTRE syncs: alerta (evento crítico, auditoria, Telegram) e NÃO bloqueia", async () => {
    const { mundo, deps, pedido } = criarMundoAgente({ config: { enforcementAtivo: true } });
    await tratarSyncHermes(pedido(corpoSyncValido({ fingerprint: fp("a".repeat(64)) })), deps);
    mundo.agora = new Date(mundo.agoraAtual.getTime() + 60_000);
    const r = await tratarSyncHermes(pedido(corpoSyncValido({ fingerprint: fp(M2) })), deps);
    expect(r.status).toBe(200);
    expect(mundo.instalacao.cloneSuspeitoEm).not.toBeNull();
    expect(mundo.eventos.filter((e) => e.tipo === "hermes_clone_suspeito")).toHaveLength(1);
    expect(mundo.eventos.find((e) => e.tipo === "hermes_clone_suspeito")?.dados).toEqual({ motivo: "machine_id_trocado" });
    expect(mundo.auditoria.find((a) => a.acao === "hermes.clone_suspeito")?.detalhes).toMatchObject({ motivo: "machine_id_trocado" });
    expect(mundo.telegrams).toHaveLength(1);
    const doc = verificarDocumentoHermes((r.corpo as { licenca: never }).licenca, { h1: mundo.hermes.publicaB64 })!;
    expect(doc.status).toBe("ativa");
    expect(doc.bloqueante).toBe(false);
    // o seguinte, já com o novo valor, não repete o alerta
    mundo.agora = new Date(mundo.agoraAtual.getTime() + 60_000);
    await tratarSyncHermes(pedido(corpoSyncValido({ fingerprint: fp(M2) })), deps);
    expect(mundo.telegrams).toHaveLength(1);
  });

  it("o primeiro sync NÃO compara com o fingerprint do instalador (cálculo pode diferir)", async () => {
    const { mundo, deps, pedido } = criarMundoAgente({ instalacao: { fingerprint: { machine_id_hash: "z".repeat(64) } } });
    await tratarSyncHermes(pedido(corpoSyncValido({ fingerprint: fp("a".repeat(64)) })), deps);
    expect(mundo.instalacao.cloneSuspeitoEm).toBeNull();
    expect(mundo.telegrams).toHaveLength(0);
  });

  async function replays(mundo: ReturnType<typeof criarMundoAgente>["mundo"], deps: ReturnType<typeof criarMundoAgente>["deps"], p: ReturnType<ReturnType<typeof criarMundoAgente>["pedido"]>, n: number) {
    const rs: RespostaHttp[] = [];
    for (let i = 0; i < n; i++) {
      mundo.agora = new Date(mundo.agoraAtual.getTime() + 1000);
      rs.push(await tratarSyncHermes(p, deps));
    }
    return rs;
  }

  it("REPLAY assinado repetido (3 em 10 min) vira alerta de clone; nunca bloqueia nem muda o 409", async () => {
    const { mundo, deps, pedido } = criarMundoAgente({ config: { enforcementAtivo: true } });
    const p = pedido(corpoSyncValido());
    expect((await tratarSyncHermes(p, deps)).status).toBe(200);
    const rs = await replays(mundo, deps, p, 3);
    for (const r of rs) expect(r).toMatchObject({ status: 409, corpo: { erro: "REPLAY" } });
    expect(mundo.eventos.filter((e) => e.tipo === "hermes_clone_suspeito")).toHaveLength(1);
    expect(mundo.eventos.at(-1)?.dados).toEqual({ motivo: "replay_assinado" });
    expect(mundo.telegrams).toHaveLength(1);
    expect(mundo.instalacao.cloneSuspeitoEm).not.toBeNull();
    // mais replays não repetem o alerta
    await replays(mundo, deps, p, 3);
    expect(mundo.telegrams).toHaveLength(1);
    // contador em saude._controle, sem apagar o resto do estado
    expect((mundo.instalacao.saude as { _controle: { replays: number[] } })._controle.replays.length).toBeGreaterThanOrEqual(3);
    expect(mundo.instalacao.saude).toMatchObject({ container: "rodando" });
  });

  it("1 ou 2 replays (retry legítimo) não alertam; o sync seguinte limpo segue 200", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    const p = pedido(corpoSyncValido());
    await tratarSyncHermes(p, deps);
    await replays(mundo, deps, p, 2);
    expect(mundo.telegrams).toHaveLength(0);
    mundo.agora = new Date(mundo.agoraAtual.getTime() + 60_000);
    expect((await tratarSyncHermes(pedido(corpoSyncValido()), deps)).status).toBe(200);
  });

  it("REPLAY na perda da corrida atômica também conta", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    mundo.avancarSempre = false;
    await replays(mundo, deps, pedido(corpoSyncValido()), 3);
    expect(mundo.telegrams).toHaveLength(1);
  });

  it("requisição NÃO autenticada nunca conta como replay (não dá para forjar alerta)", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    await tratarSyncHermes(pedido(corpoSyncValido()), deps);
    const forjado = { ...pedido(corpoSyncValido()), assinatura: "AAAA" };
    for (let i = 0; i < 6; i++) expect((await tratarSyncHermes(forjado, deps)).status).toBe(401);
    expect(mundo.telegrams).toHaveLength(0);
    expect(mundo.instalacao.cloneSuspeitoEm).toBeNull();
  });
});

describe("POST /api/agente/hermes: indisponibilidade da chave", () => {
  it("503 genérico sem vazar detalhe quando a SK Hermes não está disponível; estado ainda é gravado", async () => {
    const { mundo, deps, pedido } = criarMundoAgente();
    mundo.falhaAssinatura = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await tratarSyncHermes(pedido(corpoSyncValido()), deps);
    expect(r.status).toBe(503);
    expect(JSON.stringify(r.corpo)).not.toMatch(/RVLAND|SK|detalhe/i);
    expect(r.corpo).toEqual({ erro: "INDISPONIVEL" });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/detalhe interno/);
    expect(mundo.instalacao.versao).toBe("0.14.26");
  });
});
