/**
 * Repositórios SQL do Hermes (Drizzle/Postgres). SEM `import "server-only"` de
 * propósito: o script de integração (scripts/testes-integracao-hermes.ts, tsx)
 * importa este arquivo contra um Postgres descartável. Nada aqui lê config,
 * segredos nem envia mensagens; só fala com o banco (DATABASE_URL, lazy).
 *
 * O que SÓ se prova com banco real (ver o script de integração): consumo
 * atômico da chave, upsert de solicitação com ON CONFLICT na expressão do
 * índice, incremento atômico do rate limit, avanço atômico do anti-replay.
 */
import { and, eq, isNull, like, lt, or, sql } from "drizzle-orm";

import {
  db,
  clientes,
  contratos,
  eventos,
  faturas,
  hermesChaves,
  hermesInstalacoes,
  hermesLicencas,
  hermesLimites,
  servidores,
} from "@/lib/db";
import { novoProtocolo } from "@/lib/hermes/chave";
import { criadoPorChave, PREFIXO_CRIADOR_CHAVE } from "@/lib/hermes/origem-servidor";
import type { ControleClone } from "@/lib/hermes/clone";
import { proximoVencimentoAgendado } from "@/lib/dominio/faturas";
import { competenciaDe, hojeSP } from "@/lib/dominio/tempo";
import type { CanalHermes } from "@/lib/hermes/documento";
import type {
  ChaveHermes,
  DadosSolicitacao,
  RepoAtivacao,
  RepoSolicitacoes,
  ResultadoAtivacao,
  UsoChave,
} from "./hermes-ativacao-tipos";
import { paraData } from "./hermes-tempo";
import type { RepoLimites } from "./hermes-limite";
import type {
  DadosLicenca,
  EventoNovo,
  InstalacaoHermes,
  PatchInstalacao,
  ServidorAgente,
} from "./hermes-tipos";

const json = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));

type Linhas = Record<string, unknown>[];
/** `db.execute` (postgres-js) devolve um array-like de linhas. */
const linhas = (r: unknown) => r as unknown as Linhas;

// ── rate limit ──────────────────────────────────────────────────────────────

export const repoLimites: RepoLimites = {
  async incrementar(chave, janela) {
    const [r] = await db
      .insert(hermesLimites)
      .values({ chave, janela, contagem: 1 })
      .onConflictDoUpdate({
        target: [hermesLimites.chave, hermesLimites.janela],
        set: { contagem: sql`${hermesLimites.contagem} + 1` },
      })
      .returning({ contagem: hermesLimites.contagem });
    // faxina oportunista (1%): janelas com mais de 2 dias não servem mais
    if (Math.random() < 0.01) {
      await db
        .delete(hermesLimites)
        .where(lt(hermesLimites.janela, new Date(Date.now() - 2 * 86400_000)))
        .catch(() => undefined);
    }
    return r.contagem;
  },
  async ler(chave, janela) {
    const [r] = await db
      .select({ contagem: hermesLimites.contagem })
      .from(hermesLimites)
      .where(and(eq(hermesLimites.chave, chave), eq(hermesLimites.janela, janela)));
    return r?.contagem ?? 0;
  },
};

// ── solicitações ────────────────────────────────────────────────────────────

function codigoPg(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

export const repoSolicitacoes: RepoSolicitacoes = {
  async upsert(d: DadosSolicitacao) {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      try {
        // ON CONFLICT repete EXATAMENTE a expressão do índice hermes_solicitacoes_cnpj_maquina_uidx:
        // (cnpj, coalesce(fingerprint->>'machine_id_hash', ''))
        const r = linhas(
          await db.execute(sql`
            INSERT INTO hermes_solicitacoes
              (protocolo, cnpj, cnpj_raiz, identificacao, fingerprint, origem_identificacao,
               ip_origem, versao_instalador, status, cliente_provavel_id, motivo)
            VALUES
              (${novoProtocolo()}, ${d.cnpj}, ${d.cnpjRaiz}, ${json(d.identificacao)}::jsonb,
               ${json(d.fingerprint)}::jsonb, ${d.origemIdentificacao}, ${d.ipOrigem},
               ${d.versaoInstalador}, ${d.status}, ${d.clienteProvavelId}::uuid, ${d.motivo})
            ON CONFLICT (cnpj, (coalesce(fingerprint->>'machine_id_hash', '')))
            DO UPDATE SET
              tentativas = hermes_solicitacoes.tentativas + 1,
              ultima_em = now(),
              ip_origem = EXCLUDED.ip_origem,
              versao_instalador = EXCLUDED.versao_instalador,
              identificacao = COALESCE(EXCLUDED.identificacao, hermes_solicitacoes.identificacao),
              cliente_provavel_id = COALESCE(hermes_solicitacoes.cliente_provavel_id, EXCLUDED.cliente_provavel_id),
              status = CASE WHEN EXCLUDED.status = 'suspeita' AND hermes_solicitacoes.status = 'pendente'
                            THEN 'suspeita' ELSE hermes_solicitacoes.status END,
              motivo = CASE WHEN EXCLUDED.status = 'suspeita' AND hermes_solicitacoes.status = 'pendente'
                            THEN EXCLUDED.motivo ELSE hermes_solicitacoes.motivo END
            RETURNING protocolo, tentativas, (xmax = 0) AS criada
          `)
        );
        const l = r[0];
        return { protocolo: String(l.protocolo), tentativas: Number(l.tentativas), criada: l.criada === true };
      } catch (err) {
        // 23505 aqui só pode ser colisão do PROTOCOLO (o dedupe é tratado pelo ON CONFLICT): sorteia outro
        if (codigoPg(err) !== "23505") throw err;
      }
    }
    throw new Error("não foi possível gerar um protocolo único");
  },
};

/** Cliente cuja raiz de CNPJ casa com `documento`; só se for ÚNICO. */
export async function clientePorRaiz(raiz: string): Promise<string | null> {
  const r = linhas(
    await db.execute(sql`
      SELECT id FROM clientes
      WHERE left(regexp_replace(coalesce(documento, ''), '\\D', '', 'g'), 8) = ${raiz}
      LIMIT 2
    `)
  );
  return r.length === 1 ? String(r[0].id) : null;
}

// ── ativação ────────────────────────────────────────────────────────────────

function mapearChave(l: Linhas[number]): ChaveHermes {
  return {
    id: String(l.id),
    tipo: l.tipo as ChaveHermes["tipo"],
    clienteId: String(l.cliente_id),
    cnpj: (l.cnpj as string | null) ?? null,
    instalacaoId: (l.instalacao_id as string | null) ?? null,
    prefixo: String(l.prefixo),
    canalInicial: l.canal_inicial as CanalHermes,
    expiraEm: paraData(l.expira_em),
    usadaEm: l.usada_em ? paraData(l.usada_em) : null,
    usadaFingerprint: (l.usada_fingerprint as Record<string, unknown> | null) ?? null,
    resultadoInstalacaoId: (l.resultado_instalacao_id as string | null) ?? null,
    revogadaEm: l.revogada_em ? paraData(l.revogada_em) : null,
  };
}

class SemConsumo extends Error {}

/**
 * Consumo ATÔMICO: uma única instrução decide quem leva a chave. Duas
 * requisições simultâneas: o Postgres serializa o UPDATE na linha; a segunda
 * reavalia o WHERE (`usada_em IS NULL` já falso) e não devolve linha.
 */
async function consumirChave(
  tx: Pick<typeof db, "execute">,
  hash: string,
  tipo: "instalacao" | "adocao",
  uso: UsoChave
): Promise<ChaveHermes | null> {
  const r = linhas(
    await tx.execute(sql`
      UPDATE hermes_chaves
         SET usada_em = now(), usada_ip = ${uso.ip}, usada_fingerprint = ${json(uso.fingerprint)}::jsonb
       WHERE token_hash = ${hash}
         AND tipo = ${tipo}
         AND usada_em IS NULL
         AND revogada_em IS NULL
         AND expira_em > now()
      RETURNING *
    `)
  );
  return r.length ? mapearChave(r[0]) : null;
}

export const repoAtivacao: RepoAtivacao = {
  async chavePorHash(hash) {
    const r = linhas(await db.execute(sql`SELECT * FROM hermes_chaves WHERE token_hash = ${hash} LIMIT 1`));
    return r.length ? mapearChave(r[0]) : null;
  },

  async clienteBasico(clienteId) {
    const [c] = await db
      .select({ nome: clientes.nome, documento: clientes.documento })
      .from(clientes)
      .where(eq(clientes.id, clienteId))
      .limit(1);
    return c ? { nome: c.nome, cnpj: c.documento } : null;
  },

  async servidorParaAdocao(servidorId) {
    const [s] = await db
      .select({
        id: servidores.id,
        clienteId: servidores.clienteId,
        status: servidores.status,
        agentePubkey: servidores.agentePubkey,
        instalacaoVinculadaId: hermesInstalacoes.id,
      })
      .from(servidores)
      .leftJoin(hermesInstalacoes, eq(hermesInstalacoes.servidorId, servidores.id))
      .where(eq(servidores.id, servidorId))
      .limit(1);
    return s ?? null;
  },

  async instalacaoDoResultado(instalacaoId) {
    const [i] = await db
      .select({
        id: hermesInstalacoes.id,
        servidorId: hermesInstalacoes.servidorId,
        canal: hermesInstalacoes.canal,
        servidorStatus: servidores.status,
      })
      .from(hermesInstalacoes)
      .leftJoin(servidores, eq(servidores.id, hermesInstalacoes.servidorId))
      .where(eq(hermesInstalacoes.id, instalacaoId))
      .limit(1);
    return i ?? null;
  },

  async ativarInstalar(hash, _agora, uso): Promise<ResultadoAtivacao | null> {
    try {
      return await db.transaction(async (tx) => {
        const chave = await consumirChave(tx, hash, "instalacao", uso);
        if (!chave) throw new SemConsumo();

        const [cliente] = await tx.select({ nome: clientes.nome }).from(clientes).where(eq(clientes.id, chave.clienteId));
        const nome = cliente?.nome ?? "Hermes";
        const [srv] = await tx
          .insert(servidores)
          .values({ clienteId: chave.clienteId, nome: `Hermes - ${nome}`, status: "pendente" })
          .returning({ id: servidores.id });
        const [inst] = await tx
          .insert(hermesInstalacoes)
          .values({
            clienteId: chave.clienteId,
            servidorId: srv.id,
            nome,
            cnpj: uso.cnpj,
            cnpjRaiz: uso.cnpj.slice(0, 8),
            identificacao: uso.identificacao,
            origemIdentificacao: uso.origemIdentificacao,
            status: "aguardando_ativacao",
            canal: chave.canalInicial,
            fingerprint: uso.fingerprint,
            criadoPor: criadoPorChave(chave.prefixo),
          })
          .returning({ id: hermesInstalacoes.id });
        await tx.update(hermesChaves).set({ resultadoInstalacaoId: inst.id }).where(eq(hermesChaves.id, chave.id));
        return { chave: { ...chave, resultadoInstalacaoId: inst.id }, instalacaoId: inst.id, servidorId: srv.id, canal: chave.canalInicial };
      });
    } catch (err) {
      if (err instanceof SemConsumo) return null;
      throw err;
    }
  },

  async ativarAdotar(hash, _agora, uso, servidorId): Promise<ResultadoAtivacao | null> {
    try {
      return await db.transaction(async (tx) => {
        const chave = await consumirChave(tx, hash, "adocao", uso);
        if (!chave || !chave.instalacaoId) throw new SemConsumo();

        // só vincula se a instalação ainda não tem OUTRO servidor e não está revogada/desinstalada;
        // senão desfaz o consumo (a transação inteira é revertida: a chave NÃO é queimada)
        const r = linhas(
          await tx.execute(sql`
            UPDATE hermes_instalacoes
               SET servidor_id = ${servidorId}::uuid,
                   cnpj = COALESCE(cnpj, ${uso.cnpj}),
                   cnpj_raiz = COALESCE(cnpj_raiz, ${uso.cnpj.slice(0, 8)}),
                   identificacao = COALESCE(${json(uso.identificacao)}::jsonb, identificacao),
                   origem_identificacao = COALESCE(${uso.origemIdentificacao}, origem_identificacao),
                   fingerprint = ${json(uso.fingerprint)}::jsonb,
                   atualizado_em = now()
             WHERE id = ${chave.instalacaoId}::uuid
               AND (servidor_id IS NULL OR servidor_id = ${servidorId}::uuid)
               AND status NOT IN ('revogada', 'desinstalada')
            RETURNING id, canal
          `)
        );
        if (!r.length) throw new SemConsumo();
        await tx.update(hermesChaves).set({ resultadoInstalacaoId: chave.instalacaoId }).where(eq(hermesChaves.id, chave.id));
        return {
          chave: { ...chave, resultadoInstalacaoId: chave.instalacaoId },
          instalacaoId: chave.instalacaoId,
          servidorId,
          canal: r[0].canal as CanalHermes,
        };
      });
    } catch (err) {
      if (err instanceof SemConsumo || codigoPg(err) === "23505") return null;
      throw err;
    }
  },
};

// ── agente: servidor, instalação, anti-replay, eventos, licença ─────────────

/**
 * Servidor criado pela ativação Hermes (instalação com `criado_por 'chave:%'`)? O Credit e o
 * Pic Price o tratam como desconhecido. Servidor adotado (já existente) NÃO conta.
 */
export async function servidorEhHermes(servidorId: string): Promise<boolean> {
  const [i] = await db
    .select({ id: hermesInstalacoes.id })
    .from(hermesInstalacoes)
    .where(and(eq(hermesInstalacoes.servidorId, servidorId), like(hermesInstalacoes.criadoPor, `${PREFIXO_CRIADOR_CHAVE}%`)))
    .limit(1);
  return !!i;
}

export async function servidorAtivo(id: string): Promise<ServidorAgente | null> {
  const [s] = await db
    .select({ id: servidores.id, clienteId: servidores.clienteId, agentePubkey: servidores.agentePubkey })
    .from(servidores)
    .where(and(eq(servidores.id, id), eq(servidores.status, "ativo")))
    .limit(1);
  return s ?? null;
}

export async function instalacaoPorServidor(servidorId: string): Promise<InstalacaoHermes | null> {
  const [i] = await db.select().from(hermesInstalacoes).where(eq(hermesInstalacoes.servidorId, servidorId)).limit(1);
  if (!i) return null;
  return {
    id: i.id,
    clienteId: i.clienteId,
    servidorId: i.servidorId,
    nome: i.nome,
    cnpj: i.cnpj,
    status: i.status,
    canal: i.canal,
    enforcement: i.enforcement,
    versao: i.versao,
    sha: i.sha,
    digest: i.digest,
    canalEmUso: i.canalEmUso,
    saude: i.saude,
    fingerprint: i.fingerprint,
    ultimoTsAgente: i.ultimoTsAgente,
    cloneSuspeitoEm: i.cloneSuspeitoEm,
    ativadaEm: i.ativadaEm,
  };
}

/** Anti-replay atômico: só avança se o timestamp for estritamente maior que o último aceito. */
export async function avancarTimestamp(instalacaoId: string, ts: Date): Promise<boolean> {
  const r = await db
    .update(hermesInstalacoes)
    .set({ ultimoTsAgente: ts })
    .where(
      and(
        eq(hermesInstalacoes.id, instalacaoId),
        or(isNull(hermesInstalacoes.ultimoTsAgente), lt(hermesInstalacoes.ultimoTsAgente, ts))
      )
    )
    .returning({ id: hermesInstalacoes.id });
  return r.length > 0;
}

export async function gravarInstalacao(instalacaoId: string, patch: PatchInstalacao): Promise<void> {
  await db
    .update(hermesInstalacoes)
    .set({ ...patch, atualizadoEm: new Date() })
    .where(eq(hermesInstalacoes.id, instalacaoId));
}

/**
 * Grava só `saude._controle` (merge de UMA chave via jsonb_set): o resto de `saude`
 * (estado do container etc.) não é sobrescrito por um sync recusado.
 */
export async function gravarControleClone(instalacaoId: string, controle: ControleClone): Promise<void> {
  await db.execute(sql`
    UPDATE hermes_instalacoes
       SET saude = jsonb_set(coalesce(saude, '{}'::jsonb), '{_controle}', ${json(controle)}::jsonb, true),
           atualizado_em = now()
     WHERE id = ${instalacaoId}::uuid
  `);
}

/** Promoção atômica e condicional aguardando_ativacao -> ativa; true = esta chamada mudou a linha. */
export async function ativarSeAguardando(instalacaoId: string, agora: Date): Promise<boolean> {
  const r = await db
    .update(hermesInstalacoes)
    .set({ status: "ativa", ativadaEm: agora, atualizadoEm: new Date() })
    .where(and(eq(hermesInstalacoes.id, instalacaoId), eq(hermesInstalacoes.status, "aguardando_ativacao")))
    .returning({ id: hermesInstalacoes.id });
  return r.length > 0;
}

export async function inserirEventos(servidorId: string, evs: EventoNovo[]): Promise<void> {
  if (!evs.length) return;
  await db.insert(eventos).values(
    evs.map((e) => ({
      servidorId,
      tipo: e.tipo as (typeof eventos.$inferInsert)["tipo"],
      severidade: e.severidade,
      mensagem: e.mensagem,
      dados: e.dados,
    }))
  );
}

/**
 * `hermes_licencas` + contrato Hermes vinculado (faturas abertas e próximo
 * vencimento agendado, como em lib/consultas/licencas.ts). Contrato que não é
 * recorrente é ignorado (a regra do Credit só vale para recorrente).
 */
export async function dadosLicencaCliente(clienteId: string): Promise<Pick<DadosLicenca, "hermesLicenca" | "contrato">> {
  const [hl] = await db.select().from(hermesLicencas).where(eq(hermesLicencas.clienteId, clienteId)).limit(1);
  const hermesLicenca = hl
    ? {
        independeFinanceiro: hl.independeFinanceiro,
        renovacaoDias: hl.renovacaoDias,
        bloqueioManual: hl.bloqueioManual,
        diasConfianca: hl.diasConfianca,
      }
    : null;
  if (!hl?.contratoId) return { hermesLicenca, contrato: null };

  const [c] = await db.select().from(contratos).where(eq(contratos.id, hl.contratoId)).limit(1);
  if (!c || c.tipo !== "recorrente") return { hermesLicenca, contrato: null };

  const [abertas, faturadas] = await Promise.all([
    db
      .select({ vencimento: faturas.vencimento, historica: faturas.historica })
      .from(faturas)
      .where(and(eq(faturas.contratoId, c.id), eq(faturas.status, "aberta"))),
    db
      .select({ competencia: faturas.competencia })
      .from(faturas)
      .where(and(eq(faturas.contratoId, c.id), eq(faturas.historica, false))),
  ]);

  const ativo = c.status === "ativo";
  const proximoAgendado =
    ativo && c.diaVencimento
      ? {
          vencimento: proximoVencimentoAgendado(
            c.diaVencimento,
            faturadas.map((f) => competenciaDe(f.competencia)),
            hojeSP()
          ),
          toleranciaDias: c.toleranciaDias,
        }
      : undefined;

  return {
    hermesLicenca,
    contrato: {
      ativo,
      faturasAbertas: abertas.map((f) => ({ vencimento: f.vencimento, toleranciaDias: c.toleranciaDias, historica: f.historica })),
      proximoAgendado,
    },
  };
}
