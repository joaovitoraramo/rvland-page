/**
 * Ensaio de INTEGRAÇÃO do painel do Hermes contra um Postgres DESCARTÁVEL (NÃO roda no `npm test`).
 * Prova o SQL que o repositório em memória não prova (lib/servicos/hermes-painel-repo.ts):
 *
 *   1. emissão da chave: guarda só o hash; adoção cria a instalação (sem servidor, `criado_por 'painel:'`,
 *      que NÃO é servidor Hermes isolado) na MESMA transação da chave (colisão de hash desfaz tudo);
 *      REEMISSÃO/clique duplo de adoção do mesmo cliente reaproveita a instalação órfã (1k-1n), não acumula;
 *   2. revogação atômica: N revogações simultâneas = exatamente 1; chave usada não revoga;
 *   3. listagem/detalhe (joins instalação x cliente x servidor), eventos `hermes\_%` (o `_` é literal),
 *      chaves da instalação, versões do agente (distintas e ativas);
 *   4. canal, pin de versão do agente, prova de chave real só das instalações ativas;
 *   5. `idsServidoresHermes` (só `chave:%`), `registrarContatoServidor` com `agente_versao` (item 7);
 *   6. visão geral e detalhe de ponta a ponta com o SQL real.
 *
 * Uso (o banco precisa ter as migrações aplicadas):
 *   HERMES_TESTE_DATABASE_URL=postgres://.../hermes_painel_teste npx tsx scripts/testes-integracao-hermes-painel.ts
 *
 * Salvaguardas: só roda se o NOME do banco contiver test|teste|tmp|descart; não lê .env*; não imprime
 * a URL; limpa o que criou (tag única por execução).
 */
import { randomBytes } from "node:crypto";

const URL_TESTE = process.env.HERMES_TESTE_DATABASE_URL ?? "";

function nomeDoBanco(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

if (!URL_TESTE) {
  console.error("Defina HERMES_TESTE_DATABASE_URL (Postgres descartável com as migrações aplicadas).");
  process.exit(2);
}
if (!/(test|teste|tmp|descart)/i.test(nomeDoBanco(URL_TESTE))) {
  console.error("Recusado: o nome do banco precisa conter test, teste, tmp ou descart.");
  process.exit(2);
}
process.env.DATABASE_URL = URL_TESTE;

let falhas = 0;
function confere(nome: string, ok: boolean, detalhe = "") {
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas++;
}

async function main() {
  const { sql, eq, inArray } = await import("drizzle-orm");
  const { db, clientes, servidores, eventos, hermesChaves, hermesInstalacoes, agenteReleases } = await import("../lib/db");
  const { hashChaveHermes } = await import("../lib/hermes/chave");
  const { dadosLicencaCliente, registrarContatoServidor, servidorEhHermes } = await import("../lib/servicos/hermes-repo");
  const repo = await import("../lib/servicos/hermes-painel-repo");
  const svc = await import("../lib/servicos/hermes-painel");

  const tag = `itest-${randomBytes(4).toString("hex")}`;
  const CNPJ_FMT = "11.222.333/0001-81";
  const CNPJ = "11222333000181";

  const t = (await db.execute(sql`select count(*)::int as n from information_schema.tables where table_name in ('hermes_chaves','hermes_instalacoes','agente_releases','eventos','servidores')`)) as unknown as { n: number }[];
  if (Number(t[0].n) !== 5) {
    console.error("Tabelas ausentes: rode as migrações no banco descartável antes.");
    process.exit(2);
  }

  const [cliente] = await db.insert(clientes).values({ nome: `Teste ${tag}`, documento: CNPJ_FMT }).returning({ id: clientes.id });
  const [clienteDup] = await db.insert(clientes).values({ nome: `Dup ${tag}`, documento: CNPJ_FMT }).returning({ id: clientes.id });
  const [clienteOrfas] = await db.insert(clientes).values({ nome: `Orfas ${tag}`, documento: CNPJ_FMT }).returning({ id: clientes.id });
  const todosClientes = [cliente.id, clienteDup.id, clienteOrfas.id];
  const [clienteSemDoc] = await db.insert(clientes).values({ nome: `SemDoc ${tag}` }).returning({ id: clientes.id });
  const versoes = [`9.${Math.floor(Math.random() * 900) + 100}.0`, `9.${Math.floor(Math.random() * 900) + 100}.1`];
  const auditoria: { acao: string; entidadeId?: string; detalhes?: Record<string, unknown> }[] = [];
  const agora = () => new Date();

  const escrita = {
    ...repo.repoEscritaPainel,
    agora,
    auditar: async (a: { acao: string; entidadeId?: string; detalhes?: Record<string, unknown> }) => void auditoria.push(a),
    lerEnforcement: async () => ({ ativo: false, ligado_em: null, ligado_por: null, motivo: null }),
    gravarEnforcement: async () => undefined,
  };

  try {
    // ── 1. chaves ──
    const r1 = await svc.gerarChavePainel({ tipo: "instalacao", clienteId: cliente.id, canal: "preview", por: "Ana" }, escrita);
    confere("1a. chave de instalação gerada", r1.ok);
    if (!r1.ok) throw new Error("sem chave");
    const [k1] = await db.select().from(hermesChaves).where(eq(hermesChaves.tokenHash, hashChaveHermes(r1.chave)));
    confere("1b. só o hash é guardado (a chave em claro não está em nenhuma coluna)", !!k1 && k1.tokenHash !== r1.chave && k1.prefixo === r1.chave.slice(0, 8));
    confere("1c. snapshot do CNPJ só dígitos, canal e 12 h de validade", k1.cnpj === CNPJ && k1.canalInicial === "preview" && Math.abs(k1.expiraEm.getTime() - Date.now() - 12 * 3600_000) < 60_000);
    confere("1d. instalação não cria instalação", k1.instalacaoId === null);

    const r2 = await svc.gerarChavePainel({ tipo: "adocao", clienteId: cliente.id, canal: "stable", por: "Ana" }, escrita);
    confere("1e. chave de adoção gerada", r2.ok);
    if (!r2.ok) throw new Error("sem chave de adoção");
    const [k2] = await db.select().from(hermesChaves).where(eq(hermesChaves.tokenHash, hashChaveHermes(r2.chave)));
    const [iAdocao] = await db.select().from(hermesInstalacoes).where(eq(hermesInstalacoes.id, k2.instalacaoId as string));
    confere(
      "1f. adoção cria a instalação sem servidor, aguardando ativação, criada por 'painel:' (não 'chave:')",
      !!iAdocao && iAdocao.servidorId === null && iAdocao.status === "aguardando_ativacao" && iAdocao.criadoPor === "painel:Ana" && iAdocao.cnpjRaiz === "11222333",
      `criado_por=${iAdocao?.criadoPor}`
    );
    confere("1g. validade da adoção = 24 h", Math.abs(k2.expiraEm.getTime() - Date.now() - 24 * 3600_000) < 60_000);

    // atomicidade: hash repetido derruba a chave E a instalação criada na mesma transação
    const antes = (await db.select({ id: hermesInstalacoes.id }).from(hermesInstalacoes).where(eq(hermesInstalacoes.clienteId, cliente.id))).length;
    let falhou = false;
    try {
      await repo.repoEscritaPainel.inserirChave({
        tipo: "adocao", clienteId: cliente.id, cnpj: CNPJ, instalacaoId: null, criarInstalacao: { nome: "x", canal: "stable" },
        hash: k1.tokenHash, prefixo: "hmk_dupl", canalInicial: "stable", expiraEm: new Date(Date.now() + 1000), por: "Ana",
      });
    } catch {
      falhou = true;
    }
    const depois = (await db.select({ id: hermesInstalacoes.id }).from(hermesInstalacoes).where(eq(hermesInstalacoes.clienteId, cliente.id))).length;
    confere("1h. hash duplicado: falha e a instalação criada junto é desfeita", falhou && antes === depois, `antes=${antes} depois=${depois}`);

    const rSemDoc = await svc.gerarChavePainel({ tipo: "instalacao", clienteId: clienteSemDoc.id, canal: "stable", por: "Ana" }, escrita);
    confere("1i. cliente sem CNPJ: recusado, nada gravado", !rSemDoc.ok && (await db.select({ id: hermesChaves.id }).from(hermesChaves).where(eq(hermesChaves.clienteId, clienteSemDoc.id))).length === 0);
    confere("1j. auditoria da emissão não carrega a chave", auditoria.length === 2 && !JSON.stringify(auditoria).includes(r1.chave) && !JSON.stringify(auditoria).includes(r2.chave));

    // reemissão da adoção: reaproveita a órfã (iAdocao: sem servidor, aguardando, `painel:`), sem criar outra
    const contaInst = async (clienteId: string) => (await db.select({ id: hermesInstalacoes.id }).from(hermesInstalacoes).where(eq(hermesInstalacoes.clienteId, clienteId))).length;
    const instAntes = await contaInst(cliente.id);
    const auditoriaAntes = auditoria.length;
    const r3 = await svc.gerarChavePainel({ tipo: "adocao", clienteId: cliente.id, canal: "preview", por: "Bia" }, escrita);
    if (!r3.ok) throw new Error("sem 2a chave de adoção");
    const [k3] = await db.select().from(hermesChaves).where(eq(hermesChaves.tokenHash, hashChaveHermes(r3.chave)));
    const [iAdocao2] = await db.select().from(hermesInstalacoes).where(eq(hermesInstalacoes.id, iAdocao.id));
    confere(
      "1k. reemitir a adoção do mesmo cliente REAPROVEITA a instalação órfã (nenhuma nova) e a chave aponta para ela",
      (await contaInst(cliente.id)) === instAntes && k3.instalacaoId === iAdocao.id && r3.instalacaoId === iAdocao.id,
      `instalacoes ${instAntes} -> ${await contaInst(cliente.id)}`
    );
    confere("1l. a auditoria diz `instalacao_criada:false` e a instalação segue o canal escolhido agora", auditoria.length === auditoriaAntes + 1 && auditoria.at(-1)?.detalhes?.instalacao_criada === false && iAdocao2.canal === "preview" && iAdocao2.criadoPor === "painel:Ana");

    // clique duplo: 12 transações de adoção simultâneas para um cliente SEM órfã (direto no repositório, sem o
    // `cliente()` do serviço no caminho, para as transações realmente sobreporem) → UMA instalação, todas as chaves nela
    await Promise.all(Array.from({ length: 10 }, () => db.execute(sql`select pg_sleep(0.3)`))); // aquece o pool: conexões prontas = transações de fato simultâneas
    const dup = await Promise.all(
      Array.from({ length: 12 }, (_v, n) =>
        repo.repoEscritaPainel.inserirChave({
          tipo: "adocao", clienteId: clienteDup.id, cnpj: CNPJ, instalacaoId: null, criarInstalacao: { nome: "Dup", canal: "stable" },
          hash: `dup-${tag}-${n}`, prefixo: `hmk_d${String(n).padStart(3, "0")}`, canalInicial: "stable", expiraEm: new Date(Date.now() + 60_000), por: "Ana",
        })
      )
    );
    const idsDup = new Set(dup.map((d) => d.instalacaoId));
    const instDup = await db.select({ id: hermesInstalacoes.id }).from(hermesInstalacoes).where(eq(hermesInstalacoes.clienteId, clienteDup.id));
    const chavesDup = await db.select({ i: hermesChaves.instalacaoId }).from(hermesChaves).where(eq(hermesChaves.clienteId, clienteDup.id));
    confere(
      "1m. 12 emissões de adoção simultâneas (clique duplo): UMA instalação, 12 chaves nela, UMA reportada como criada",
      instDup.length === 1 && idsDup.size === 1 && chavesDup.length === 12 && chavesDup.every((c) => c.i === instDup[0].id) && dup.filter((d) => d.instalacaoCriada).length === 1,
      `instalacoes=${instDup.length} ids=${idsDup.size} chaves=${chavesDup.length} criadas=${dup.filter((d) => d.instalacaoCriada).length}`
    );

    // órfãs que NÃO podem ser reaproveitadas: revogada, criada por chave, com servidor, de outro cliente
    const [srvOrf] = await db.insert(servidores).values({ clienteId: clienteOrfas.id, nome: `Orf ${tag}`, status: "ativo" }).returning({ id: servidores.id });
    const base = { cnpj: CNPJ, cnpjRaiz: "11222333", nome: "x" };
    const semAdocao = await db
      .insert(hermesInstalacoes)
      .values([
        { ...base, clienteId: clienteOrfas.id, status: "revogada", criadoPor: "painel:Ana" },
        { ...base, clienteId: clienteOrfas.id, status: "aguardando_ativacao", criadoPor: "chave:hmk_itest" },
        { ...base, clienteId: clienteOrfas.id, status: "ativa", servidorId: srvOrf.id, criadoPor: "painel:Ana" },
        { ...base, clienteId: clienteOrfas.id, status: "desinstalada", criadoPor: "painel:Ana" },
      ])
      .returning({ id: hermesInstalacoes.id });
    const r4 = await svc.gerarChavePainel({ tipo: "adocao", clienteId: clienteOrfas.id, canal: "stable", por: "Ana" }, escrita);
    confere(
      "1n. revogada/desinstalada, criada por `chave:` e instalação com servidor NÃO são reaproveitadas: cria uma nova",
      r4.ok && !!r4.instalacaoId && !semAdocao.some((x) => x.id === r4.instalacaoId) && (await contaInst(clienteOrfas.id)) === 5
    );
    const r5 = await svc.gerarChavePainel({ tipo: "adocao", clienteId: clienteOrfas.id, canal: "stable", por: "Ana" }, escrita);
    confere("1o. e a seguinte (agora há uma órfã válida) reaproveita essa nova", r5.ok && r4.ok && r5.instalacaoId === r4.instalacaoId && (await contaInst(clienteOrfas.id)) === 5);

    // ── 2. revogação atômica ──
    const rev = await Promise.all(Array.from({ length: 8 }, () => svc.revogarChavePainel({ chaveId: k1.id, por: "Ana" }, escrita)));
    confere("2a. 8 revogações simultâneas → exatamente UMA ok", rev.filter((r) => r.ok).length === 1, `ok=${rev.filter((r) => r.ok).length}`);
    const [k1b] = await db.select().from(hermesChaves).where(eq(hermesChaves.id, k1.id));
    confere("2b. revogada_em/revogada_por gravados", !!k1b.revogadaEm && k1b.revogadaPor === "Ana");
    await db.update(hermesChaves).set({ usadaEm: new Date() }).where(eq(hermesChaves.id, k2.id));
    const rUsada = await svc.revogarChavePainel({ chaveId: k2.id, por: "Ana" }, escrita);
    confere("2c. chave já usada não é revogada", !rUsada.ok);

    // ── 3/4. instalação ativa de ponta a ponta ──
    const [srv] = await db.insert(servidores).values({ clienteId: cliente.id, nome: `Hermes - ${tag}`, status: "ativo", ultimoContatoEm: new Date(), agenteVersao: "0.6.0" }).returning({ id: servidores.id });
    const [srvAdotado] = await db.insert(servidores).values({ clienteId: cliente.id, nome: `Adotado ${tag}`, status: "ativo" }).returning({ id: servidores.id });
    const [inst] = await db
      .insert(hermesInstalacoes)
      .values({
        clienteId: cliente.id, servidorId: srv.id, nome: `Mercado ${tag}`, cnpj: CNPJ, cnpjRaiz: "11222333", status: "ativa", canal: "stable",
        versao: "0.14.27", saude: { container: "rodando", saude: "saudavel", agente_versao: "0.7.0", _controle: { boots: [] } }, criadoPor: "chave:hmk_itest", ultimoEstadoEm: new Date(),
      })
      .returning({ id: hermesInstalacoes.id });
    // instalação "adotada": criado_por do painel, com servidor próprio (não é Hermes isolado)
    await db.update(hermesInstalacoes).set({ servidorId: srvAdotado.id, status: "ativa" }).where(eq(hermesInstalacoes.id, iAdocao.id));

    await db.insert(eventos).values([
      { servidorId: srv.id, tipo: "hermes_clone_suspeito", severidade: "critico", mensagem: "clone", dados: { motivo: "boot_alternando" } },
      { servidorId: srv.id, tipo: "hermes_update_ok", severidade: "info", mensagem: "ok" },
      { servidorId: srv.id, tipo: "servico_caiu", severidade: "aviso", mensagem: "outro tipo" },
    ]);
    await db.execute(sql`insert into eventos (servidor_id, tipo, severidade, mensagem) values (${srv.id}::uuid, 'hermesXpegadinha', 'info', 'underscore nao e curinga')`);
    const evs = await repo.eventosHermesDoServidor(srv.id, 30);
    confere("3a. eventos: só `hermes_*` (o `_` é literal, `hermesX...` e `servico_caiu` ficam de fora)", evs.length === 2 && evs.every((e) => e.tipo.startsWith("hermes_")), `tipos=${evs.map((e) => e.tipo).join(",")}`);

    const bruta = await repo.instalacaoBruta(inst.id);
    confere(
      "3b. instalação bruta traz cliente e servidor do join",
      !!bruta && bruta.clienteNome === `Teste ${tag}` && bruta.servidorNome === `Hermes - ${tag}` && bruta.servidorStatus === "ativo" && bruta.servidorAgenteVersao === "0.6.0" && bruta.servidorVersaoAlvo === null
    );
    const todas = await repo.listarInstalacoesBrutas();
    confere("3c. lista inclui a instalação sem servidor (LEFT JOIN) e a ativa", todas.some((i) => i.id === inst.id) && todas.some((i) => i.servidorId === srvAdotado.id));
    confere("3d. chaves da instalação: a de adoção aparece pela instalação alvo", (await repo.chavesDaInstalacao(iAdocao.id)).some((c) => c.id === k2.id));
    confere("3e. chaves listadas com cliente e sem hash", (await repo.listarChavesBrutas(100)).every((c) => !("tokenHash" in c)) && (await repo.listarChavesBrutas(100)).some((c) => c.id === k1.id && c.clienteNome === `Teste ${tag}`));

    // versões do agente: distintas e só ativas
    await db.insert(agenteReleases).values([
      { versao: versoes[0], arch: "amd64", canal: "estavel", caminhoStorage: "x", sha256: "a".repeat(64), assinatura: "x", ativo: true },
      { versao: versoes[0], arch: "arm64", canal: "estavel", caminhoStorage: "x", sha256: "b".repeat(64), assinatura: "x", ativo: true },
      { versao: versoes[1], arch: "amd64", canal: "canary", caminhoStorage: "x", sha256: "c".repeat(64), assinatura: "x", ativo: false },
    ]);
    const pub = await repo.versoesAgentePublicadas();
    confere("3f. versões publicadas: distintas e só ativas", pub.filter((v) => v === versoes[0]).length === 1 && !pub.includes(versoes[1]));

    // canal
    const rc = await svc.trocarCanalPainel({ instalacaoId: inst.id, canal: "preview", por: "Ana" }, escrita);
    const [ic] = await db.select({ canal: hermesInstalacoes.canal }).from(hermesInstalacoes).where(eq(hermesInstalacoes.id, inst.id));
    confere("4a. troca de canal grava no banco", rc.ok && ic.canal === "preview");

    // pin da versão do agente
    const rp = await svc.fixarVersaoAgentePainel({ instalacaoId: inst.id, versao: versoes[0], por: "Ana" }, escrita);
    const rpInativa = await svc.fixarVersaoAgentePainel({ instalacaoId: inst.id, versao: versoes[1], por: "Ana" }, escrita);
    const [sp] = await db.select({ v: servidores.versaoAlvo }).from(servidores).where(eq(servidores.id, srv.id));
    confere("4b. pin do agente grava servidores.versao_alvo; versão inativa é recusada", rp.ok && sp.v === versoes[0] && !rpInativa.ok);
    const rAuto = await svc.fixarVersaoAgentePainel({ instalacaoId: inst.id, versao: null, por: "Ana" }, escrita);
    const [sp2] = await db.select({ v: servidores.versaoAlvo }).from(servidores).where(eq(servidores.id, srv.id));
    confere("4c. voltar ao automático zera o pin", rAuto.ok && sp2.v === null);

    // prova de chave real: só as ativas
    const prova = await repo.repoEscritaPainel.instalacoesParaProva();
    confere("4d. prova considera só instalações ativas", prova.every((p) => p.status === "ativa") && prova.some((p) => p.id === inst.id));

    // ── 5. servidores Hermes e versão do agente (item 7) ──
    const ids = await repo.idsServidoresHermes();
    confere("5a. idsServidoresHermes: só `chave:%` (o adotado/painel não é Hermes isolado)", ids.has(srv.id) && !ids.has(srvAdotado.id));
    confere("5b. coerente com servidorEhHermes", (await servidorEhHermes(srv.id)) === true && (await servidorEhHermes(srvAdotado.id)) === false);
    confere("5c. instalação do servidor", (await repo.instalacaoIdDoServidor(srv.id)) === inst.id);
    const em = new Date(Date.now() + 5000);
    await registrarContatoServidor(srv.id, em, "0.7.1");
    const [s1] = await db.select({ v: servidores.agenteVersao, c: servidores.ultimoContatoEm }).from(servidores).where(eq(servidores.id, srv.id));
    confere("5d. contato com versão grava servidores.agente_versao", s1.v === "0.7.1" && s1.c?.getTime() === em.getTime());
    await registrarContatoServidor(srv.id, new Date(Date.now() + 6000), null);
    const [s2] = await db.select({ v: servidores.agenteVersao }).from(servidores).where(eq(servidores.id, srv.id));
    confere("5e. contato sem versão NÃO zera agente_versao", s2.v === "0.7.1");
    await registrarContatoServidor(srv.id, new Date(Date.now() + 7000), "");
    await registrarContatoServidor(srv.id, new Date(Date.now() + 8000));
    const [s3] = await db.select({ v: servidores.agenteVersao }).from(servidores).where(eq(servidores.id, srv.id));
    confere("5f. contato com versão vazia ou omitida também NÃO zera agente_versao", s3.v === "0.7.1");

    // ── 6. visão geral e detalhe com o SQL real ──
    const leitura = {
      agora,
      instalacoes: repo.listarInstalacoesBrutas,
      instalacao: repo.instalacaoBruta,
      eventos: repo.eventosHermesDoServidor,
      chavesDaInstalacao: repo.chavesDaInstalacao,
      versoesAgente: repo.versoesAgentePublicadas,
      async dadosLicenca(clienteId: string) {
        return { ...(await dadosLicencaCliente(clienteId)), modoPanico: false, maxDiasConfianca: 7 };
      },
      configEnforcement: async () => ({ enforcementAtivo: false, offlineHoras: 72 }),
      lerEnforcement: async () => ({ ativo: false, ligado_em: null, ligado_por: null, motivo: null }),
    };
    const v = await svc.visaoGeralPainel(leitura);
    const linha = v.linhas.find((l) => l.id === inst.id);
    confere(
      "6a. visão geral: linha da instalação com servidor online, container saudável e licença sem contrato",
      !!linha && linha.statusServidor === "online" && linha.saude.container === "rodando" && linha.licenca.modo === "simulacao" && linha.licenca.status === "sem_contrato",
      `status=${linha?.licenca.status} servidor=${linha?.statusServidor}`
    );
    confere("6b. sem chave_configurada no estado: o botão 'passar a valer' fica bloqueado", v.prontidao.pode === false && /chave_configurada/.test(v.prontidao.motivo ?? ""));
    const det = await svc.detalheInstalacaoPainel(inst.id, leitura);
    confere("6c. detalhe: eventos hermes, alerta de clone com motivo e versões publicadas", !!det && det.eventos.length === 2 && det.alertasClone[0]?.motivo === "boot_alternando" && det.versoesAgente.includes(versoes[0]));
  } finally {
    const srvs = await db.select({ id: servidores.id }).from(servidores).where(inArray(servidores.clienteId, [...todosClientes, clienteSemDoc.id]));
    if (srvs.length) await db.delete(eventos).where(inArray(eventos.servidorId, srvs.map((x) => x.id)));
    await db.delete(hermesChaves).where(inArray(hermesChaves.clienteId, [...todosClientes, clienteSemDoc.id]));
    await db.delete(hermesInstalacoes).where(inArray(hermesInstalacoes.clienteId, [...todosClientes, clienteSemDoc.id]));
    await db.delete(servidores).where(inArray(servidores.clienteId, [...todosClientes, clienteSemDoc.id]));
    await db.delete(agenteReleases).where(inArray(agenteReleases.versao, versoes));
    await db.delete(clientes).where(inArray(clientes.id, [...todosClientes, clienteSemDoc.id]));
  }

  console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} verificação(ões) FALHARAM.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Erro no ensaio:", e instanceof Error ? e.message : e);
  process.exit(1);
});
