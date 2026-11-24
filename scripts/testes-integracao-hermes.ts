/**
 * Ensaio de INTEGRAÇÃO do Hermes contra um Postgres DESCARTÁVEL (NÃO roda no
 * `npm test`, não é *.test.ts). Prova o que o repositório em memória não prova:
 * SQL atômico real.
 *
 *   1. consumo atômico da chave (UPDATE ... WHERE usada_em IS NULL ... RETURNING):
 *      N ativações simultâneas → exatamente UMA ok, uma só instalação/servidor;
 *   2. idem para adoção;
 *   3. upsert de solicitação com ON CONFLICT na expressão do índice
 *      (cnpj, coalesce(fingerprint->>'machine_id_hash','')): N simultâneas → 1 linha;
 *   4. incremento atômico do rate limit (hermes_limites);
 *   5. anti-replay atômico (avancarTimestamp): mesmo timestamp simultâneo → um só avança;
 *   6. reentrada idempotente da chave (mesma máquina, ≤ 30 min);
 *   7. promoção condicional aguardando_ativacao -> ativa (revogada nunca é promovida);
 *   2c. adoção de instalação revogada/desinstalada: recusada e a chave NÃO é consumida;
 *   1d/2d. `servidorEhHermes` (SQL): servidor criado pela ativação = true; servidor adotado = false.
 *
 * Uso (o banco precisa ter as migrações aplicadas: `DATABASE_URL=<descartavel> npm run db:migrate`):
 *
 *   HERMES_TESTE_DATABASE_URL=postgres://.../hermes_teste npx tsx scripts/testes-integracao-hermes.ts
 *
 * Salvaguardas: só roda se o NOME do banco contiver test|teste|tmp|descart; não
 * lê .env*; não imprime a URL; limpa o que criou (tag única por execução; as linhas `ativfalha:*` de hermes_limites
 * são removidas pelas chaves exatas dos IPs usados, nunca por LIKE).
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
// o repositório lê DATABASE_URL (lazy) — apontado só para o banco descartável
process.env.DATABASE_URL = URL_TESTE;

let falhas = 0;
function confere(nome: string, ok: boolean, detalhe = "") {
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas++;
}

async function main() {
  const { sql, eq, inArray } = await import("drizzle-orm");
  const { db, clientes, servidores, hermesChaves, hermesInstalacoes, hermesSolicitacoes, hermesLimites } = await import("../lib/db");
  const { gerarChaveHermes, expiraEmChave } = await import("../lib/hermes/chave");
  const { gerarParEd25519 } = await import("../lib/crypto/ed25519");
  const { assinarPedidoHermes } = await import("../lib/hermes/assinatura-agente");
  const { repoAtivacao, repoLimites, repoSolicitacoes, avancarTimestamp, ativarSeAguardando, servidorEhHermes } = await import("../lib/servicos/hermes-repo");
  const { ativarHermes: ativarHermesSemRastro } = await import("../lib/servicos/hermes-ativacao");
  const { chaveDeIp } = await import("../lib/servicos/hermes-http");

  const tag = `itest-${randomBytes(4).toString("hex")}`;
  const CNPJ = "11222333000181";
  const CNPJ2 = "11444777000161";
  const N = 8;

  // pré-requisito: tabelas migradas
  const t = (await db.execute(sql`select count(*)::int as n from information_schema.tables where table_name in ('hermes_chaves','hermes_instalacoes','hermes_solicitacoes','hermes_limites','hermes_licencas')`)) as unknown as { n: number }[];
  if (Number(t[0].n) !== 5) {
    console.error("Tabelas hermes_* ausentes: rode `DATABASE_URL=<descartavel> npm run db:migrate` antes.");
    process.exit(2);
  }

  const [cliente] = await db.insert(clientes).values({ nome: `Teste ${tag}`, documento: CNPJ }).returning({ id: clientes.id });
  const criados = { instalacoes: [] as string[], servidores: [] as string[], chaves: [] as string[] };

  // efeitos nulos: só o SQL é o que está sob prova
  const efeitos = {
    agora: () => new Date(),
    auditar: async () => undefined,
    telegram: async () => true,
    limites: repoLimites,
    solicitacoes: repoSolicitacoes,
    clientePorRaiz: async () => null,
    repo: repoAtivacao,
    gerarTokenEnroll: async (id: string) => `enroll-${id}`,
  };
  // IPs usados nas ativações: cada falha grava `ativfalha:<hash do IP>` em hermes_limites (compartilhado);
  // no fim removemos EXATAMENTE essas chaves (nunca `like 'ativfalha:%'`).
  const ipsUsados = new Set<string>();
  const ativarHermes: typeof ativarHermesSemRastro = (e, deps) => {
    ipsUsados.add(e.ip);
    return ativarHermesSemRastro(e, deps);
  };
  const fp = (m: string) => ({ machine_id_hash: m.repeat(64).slice(0, 64) });
  const corpo = (chave: string, m: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ chave, cnpj: CNPJ, fingerprint: fp(m), ...extra });

  async function novaChave(tipo: "instalacao" | "adocao", instalacaoId?: string) {
    const g = gerarChaveHermes();
    const [k] = await db
      .insert(hermesChaves)
      .values({ tipo, clienteId: cliente.id, cnpj: CNPJ, instalacaoId: instalacaoId ?? null, tokenHash: g.hash, prefixo: g.prefixo, expiraEm: expiraEmChave(tipo), criadoPor: tag })
      .returning({ id: hermesChaves.id });
    criados.chaves.push(k.id);
    return g;
  }

  try {
    // 1) instalação: N simultâneas, máquinas e IPs diferentes
    const g1 = await novaChave("instalacao");
    const r1 = await Promise.all(
      Array.from({ length: N }, (_, i) => ativarHermes({ corpo: corpo(g1.chave, String(i + 1)), ip: `10.0.0.${i + 1}` }, efeitos))
    );
    const oks = r1.filter((r) => r.status === 200);
    confere("1. N ativações simultâneas → exatamente UMA ok", oks.length === 1, `ok=${oks.length}, 401=${r1.filter((r) => r.status === 401).length}`);
    const insts = await db.select({ id: hermesInstalacoes.id, servidorId: hermesInstalacoes.servidorId }).from(hermesInstalacoes).where(eq(hermesInstalacoes.clienteId, cliente.id));
    confere("1b. uma única instalação e um único servidor pendente", insts.length === 1, `instalacoes=${insts.length}`);
    for (const i of insts) {
      criados.instalacoes.push(i.id);
      if (i.servidorId) criados.servidores.push(i.servidorId);
    }
    confere(
      "1d. servidor criado pela ativação é Hermes (o Credit/Pic Price o recusam)",
      !!insts[0]?.servidorId && (await servidorEhHermes(insts[0].servidorId)) === true
    );
    const [k1] = await db.select().from(hermesChaves).where(eq(hermesChaves.tokenHash, g1.hash));
    confere("1c. chave marcada usada com o resultado gravado", !!k1.usadaEm && k1.resultadoInstalacaoId === insts[0]?.id);

    // 6) reentrada: mesma máquina que ganhou, dentro de 30 min
    const vencedor = oks[0] ? (r1.indexOf(oks[0]) + 1).toString() : "1";
    const re = await ativarHermes({ corpo: corpo(g1.chave, vencedor), ip: "10.0.1.1" }, efeitos);
    confere("6. reentrada idempotente (mesma máquina) devolve a mesma instalação", re.status === 200 && (re.corpo as { instalacao_id: string }).instalacao_id === insts[0]?.id);
    const outra = await ativarHermes({ corpo: corpo(g1.chave, "f"), ip: "10.0.1.2" }, efeitos);
    confere("6b. outra máquina com a chave usada → 401", outra.status === 401);

    // 2) adoção: instalação existente + servidor ativo com chave pública conhecida
    const agente = gerarParEd25519();
    const [srv] = await db.insert(servidores).values({ clienteId: cliente.id, nome: `Srv ${tag}`, status: "ativo", agentePubkey: agente.publicaB64 }).returning({ id: servidores.id });
    criados.servidores.push(srv.id);
    const [instAd] = await db.insert(hermesInstalacoes).values({ clienteId: cliente.id, nome: `Adocao ${tag}`, cnpj: CNPJ, cnpjRaiz: CNPJ.slice(0, 8) }).returning({ id: hermesInstalacoes.id });
    criados.instalacoes.push(instAd.id);
    const g2 = await novaChave("adocao", instAd.id);
    const ts = new Date().toISOString();
    const prova = { servidor_id: srv.id, timestamp: ts, assinatura: assinarPedidoHermes("ativacao", ts, instAd.id, agente.privadaB64) };
    const r2 = await Promise.all(
      Array.from({ length: N }, (_, i) => ativarHermes({ corpo: corpo(g2.chave, String(i + 1), { agente_existente: prova }), ip: `10.0.2.${i + 1}` }, efeitos))
    );
    confere("2. N adoções simultâneas → exatamente UMA ok", r2.filter((r) => r.status === 200).length === 1, `ok=${r2.filter((r) => r.status === 200).length}`);
    const [ad] = await db.select({ servidorId: hermesInstalacoes.servidorId }).from(hermesInstalacoes).where(eq(hermesInstalacoes.id, instAd.id));
    confere("2b. instalação adotada aponta para o servidor", ad.servidorId === srv.id);
    confere("2d. servidor ADOTADO não é Hermes (continua servidor normal do Credit)", (await servidorEhHermes(srv.id)) === false);

    // 2c) adoção de instalação revogada/desinstalada: recusada e a chave NÃO é consumida (rollback)
    for (const st of ["revogada", "desinstalada"] as const) {
      // servidor PRÓPRIO por caso: o `srv` acima já está vinculado a outra instalação (a prova falharia antes do SQL)
      const agM = gerarParEd25519();
      const [srvM] = await db.insert(servidores).values({ clienteId: cliente.id, nome: `Srv ${st} ${tag}`, status: "ativo", agentePubkey: agM.publicaB64 }).returning({ id: servidores.id });
      criados.servidores.push(srvM.id);
      const [instMorta] = await db.insert(hermesInstalacoes).values({ clienteId: cliente.id, nome: `Adocao ${st} ${tag}`, cnpj: CNPJ, cnpjRaiz: CNPJ.slice(0, 8), status: st }).returning({ id: hermesInstalacoes.id });
      criados.instalacoes.push(instMorta.id);
      const gm = await novaChave("adocao", instMorta.id);
      const tsm = new Date().toISOString();
      const provaM = { servidor_id: srvM.id, timestamp: tsm, assinatura: assinarPedidoHermes("ativacao", tsm, instMorta.id, agM.privadaB64) };
      const rm = await ativarHermes({ corpo: corpo(gm.chave, "1", { agente_existente: provaM }), ip: "10.0.3.1" }, efeitos);
      const [km] = await db.select({ usadaEm: hermesChaves.usadaEm }).from(hermesChaves).where(eq(hermesChaves.tokenHash, gm.hash));
      const [im] = await db.select({ servidorId: hermesInstalacoes.servidorId }).from(hermesInstalacoes).where(eq(hermesInstalacoes.id, instMorta.id));
      confere(`2c. adoção de instalação ${st} → 401, chave não consumida, sem servidor`, rm.status === 401 && km.usadaEm === null && im.servidorId === null, `status=${rm.status}`);
    }

    // 3) solicitação: dedupe pelo índice de expressão
    const dados = (cnpj: string, m?: string) => ({
      cnpj, cnpjRaiz: cnpj.slice(0, 8), identificacao: { razao_social: tag }, fingerprint: m ? fp(m) : {},
      origemIdentificacao: "teste", ipOrigem: null, versaoInstalador: "t", status: "pendente" as const, clienteProvavelId: null, motivo: null,
    });
    const r3 = await Promise.all(Array.from({ length: N }, () => repoSolicitacoes.upsert(dados(CNPJ2, "a"))));
    const protos = new Set(r3.map((r) => r.protocolo));
    confere("3. N upserts simultâneos (mesmo CNPJ+máquina) → 1 protocolo", protos.size === 1, `protocolos=${protos.size}`);
    const [s3] = await db.select().from(hermesSolicitacoes).where(eq(hermesSolicitacoes.protocolo, [...protos][0]));
    confere("3b. tentativas = N", s3.tentativas === N, `tentativas=${s3.tentativas}`);
    await Promise.all([repoSolicitacoes.upsert(dados(CNPJ2)), repoSolicitacoes.upsert(dados(CNPJ2))]); // sem machine_id: coalesce('')
    await repoSolicitacoes.upsert(dados(CNPJ2, "b"));
    const todas = await db.select({ id: hermesSolicitacoes.id }).from(hermesSolicitacoes).where(eq(hermesSolicitacoes.cnpj, CNPJ2));
    confere("3c. sem machine_id deduplica por coalesce; máquina nova = nova linha (3 linhas)", todas.length === 3, `linhas=${todas.length}`);
    const susp = await repoSolicitacoes.upsert({ ...dados(CNPJ2, "a"), status: "suspeita", motivo: "teste" });
    const [s3b] = await db.select({ status: hermesSolicitacoes.status }).from(hermesSolicitacoes).where(eq(hermesSolicitacoes.protocolo, susp.protocolo));
    confere("3d. 'suspeita' promove 'pendente'", s3b.status === "suspeita");

    // 4) rate limit atômico
    const janela = new Date(Math.floor(Date.now() / 3600_000) * 3600_000);
    const cont = await Promise.all(Array.from({ length: 20 }, () => repoLimites.incrementar(`itest:${tag}`, janela)));
    confere("4. 20 incrementos simultâneos → contagens 1..20 sem repetir", new Set(cont).size === 20 && Math.max(...cont) === 20);

    // 5) anti-replay atômico
    const [instReplay] = await db.insert(hermesInstalacoes).values({ clienteId: cliente.id, nome: `Replay ${tag}` }).returning({ id: hermesInstalacoes.id });
    criados.instalacoes.push(instReplay.id);
    const tsSim = new Date();
    const r5 = await Promise.all(Array.from({ length: N }, () => avancarTimestamp(instReplay.id, tsSim)));
    confere("5. mesmo timestamp simultâneo → um único avança", r5.filter(Boolean).length === 1);
    confere("5b. timestamp anterior é recusado", (await avancarTimestamp(instReplay.id, new Date(tsSim.getTime() - 1000))) === false);
    confere("5c. timestamp posterior é aceito", (await avancarTimestamp(instReplay.id, new Date(tsSim.getTime() + 1000))) === true);

    // 7) promoção condicional aguardando_ativacao -> ativa (corrida com revogação)
    const [instPromo] = await db.insert(hermesInstalacoes).values({ clienteId: cliente.id, nome: `Promo ${tag}` }).returning({ id: hermesInstalacoes.id });
    const [instRev] = await db.insert(hermesInstalacoes).values({ clienteId: cliente.id, nome: `Promo rev ${tag}`, status: "revogada" }).returning({ id: hermesInstalacoes.id });
    criados.instalacoes.push(instPromo.id, instRev.id);
    const r7 = await Promise.all(Array.from({ length: N }, () => ativarSeAguardando(instPromo.id, new Date())));
    confere("7. N promoções simultâneas → exatamente UMA muda a linha", r7.filter(Boolean).length === 1);
    confere("7b. revogada nunca é promovida a ativa", (await ativarSeAguardando(instRev.id, new Date())) === false);
    const [pr] = await db.select({ status: hermesInstalacoes.status }).from(hermesInstalacoes).where(eq(hermesInstalacoes.id, instRev.id));
    confere("7c. revogada continua revogada", pr.status === "revogada");
  } finally {
    await db.delete(hermesSolicitacoes).where(inArray(hermesSolicitacoes.cnpj, [CNPJ2]));
    const chavesLimite = [`itest:${tag}`, ...[...ipsUsados].map((ip) => chaveDeIp("ativfalha", ip))];
    await db.delete(hermesLimites).where(inArray(hermesLimites.chave, chavesLimite));
    await db.delete(hermesChaves).where(eq(hermesChaves.clienteId, cliente.id));
    await db.delete(hermesInstalacoes).where(eq(hermesInstalacoes.clienteId, cliente.id));
    await db.delete(servidores).where(eq(servidores.clienteId, cliente.id));
    await db.delete(clientes).where(eq(clientes.id, cliente.id));
  }

  console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} verificação(ões) FALHARAM.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Erro no ensaio:", e instanceof Error ? e.message : e);
  process.exit(1);
});
