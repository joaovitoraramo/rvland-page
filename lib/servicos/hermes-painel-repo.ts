/**
 * SQL (Drizzle/Postgres) do painel do Hermes. SEM `import "server-only"` de propósito, como o
 * hermes-repo.ts: o script de integração (scripts/testes-integracao-hermes-painel.ts, tsx) importa
 * este arquivo contra um Postgres descartável. Nada aqui lê config, segredos nem envia mensagens.
 */
import { and, desc, eq, isNotNull, isNull, like, or, sql } from "drizzle-orm";

import { agenteReleases, clientes, db, eventos, hermesChaves, hermesInstalacoes, servidores } from "@/lib/db";
import { criadoPorPainel, PADRAO_LIKE_CRIADOR_CHAVE, PADRAO_LIKE_CRIADOR_PAINEL } from "@/lib/hermes/origem-servidor";
import { raizCnpj } from "@/lib/hermes/cnpj";
import type { CanalHermes } from "@/lib/hermes/documento";
import type { ChaveBruta, ChaveListada, DepsEscritaPainel, EventoBruto, InstalacaoBruta } from "./hermes-painel";

const colunasInstalacao = {
  id: hermesInstalacoes.id,
  clienteId: hermesInstalacoes.clienteId,
  clienteNome: clientes.nome,
  nome: hermesInstalacoes.nome,
  cnpj: hermesInstalacoes.cnpj,
  status: hermesInstalacoes.status,
  canal: hermesInstalacoes.canal,
  enforcement: hermesInstalacoes.enforcement,
  versao: hermesInstalacoes.versao,
  sha: hermesInstalacoes.sha,
  digest: hermesInstalacoes.digest,
  canalEmUso: hermesInstalacoes.canalEmUso,
  saude: hermesInstalacoes.saude,
  cloneSuspeitoEm: hermesInstalacoes.cloneSuspeitoEm,
  ultimoEstadoEm: hermesInstalacoes.ultimoEstadoEm,
  ativadaEm: hermesInstalacoes.ativadaEm,
  criadoEm: hermesInstalacoes.criadoEm,
  criadoPor: hermesInstalacoes.criadoPor,
  servidorId: hermesInstalacoes.servidorId,
  servidorNome: servidores.nome,
  servidorStatus: servidores.status,
  servidorUltimoContatoEm: servidores.ultimoContatoEm,
  servidorAgenteVersao: servidores.agenteVersao,
  servidorVersaoAlvo: servidores.versaoAlvo,
};

function consultaInstalacoes() {
  return db
    .select(colunasInstalacao)
    .from(hermesInstalacoes)
    .innerJoin(clientes, eq(clientes.id, hermesInstalacoes.clienteId))
    .leftJoin(servidores, eq(servidores.id, hermesInstalacoes.servidorId));
}

export async function listarInstalacoesBrutas(): Promise<InstalacaoBruta[]> {
  return consultaInstalacoes().orderBy(desc(hermesInstalacoes.criadoEm));
}

export async function instalacaoBruta(id: string): Promise<InstalacaoBruta | null> {
  const [i] = await consultaInstalacoes().where(eq(hermesInstalacoes.id, id)).limit(1);
  return i ?? null;
}

export async function eventosHermesDoServidor(servidorId: string, limite: number): Promise<EventoBruto[]> {
  return db
    .select({
      id: eventos.id,
      tipo: eventos.tipo,
      severidade: eventos.severidade,
      mensagem: eventos.mensagem,
      dados: eventos.dados,
      criadoEm: eventos.criadoEm,
    })
    .from(eventos)
    // `\_` = underscore literal (o escape padrão do LIKE no Postgres é a barra invertida)
    .where(and(eq(eventos.servidorId, servidorId), like(eventos.tipo, "hermes\\_%")))
    .orderBy(desc(eventos.criadoEm), desc(eventos.id))
    .limit(limite);
}

const colunasChave = {
  id: hermesChaves.id,
  tipo: hermesChaves.tipo,
  prefixo: hermesChaves.prefixo,
  expiraEm: hermesChaves.expiraEm,
  usadaEm: hermesChaves.usadaEm,
  revogadaEm: hermesChaves.revogadaEm,
  criadoEm: hermesChaves.criadoEm,
  criadoPor: hermesChaves.criadoPor,
};

/** Chaves emitidas PARA a instalação (adoção) ou que a CRIARAM (instalação). Nunca o hash. */
export async function chavesDaInstalacao(instalacaoId: string): Promise<ChaveBruta[]> {
  return db
    .select(colunasChave)
    .from(hermesChaves)
    .where(or(eq(hermesChaves.instalacaoId, instalacaoId), eq(hermesChaves.resultadoInstalacaoId, instalacaoId)))
    .orderBy(desc(hermesChaves.criadoEm))
    .limit(20);
}

export async function listarChavesBrutas(limite = 100): Promise<ChaveListada[]> {
  return db
    .select({
      ...colunasChave,
      clienteId: hermesChaves.clienteId,
      clienteNome: clientes.nome,
      canalInicial: hermesChaves.canalInicial,
      instalacaoId: hermesChaves.instalacaoId,
    })
    .from(hermesChaves)
    .innerJoin(clientes, eq(clientes.id, hermesChaves.clienteId))
    .orderBy(desc(hermesChaves.criadoEm))
    .limit(limite);
}

/** Versões do agente RV publicadas e ativas (distintas, da mais recente para a mais antiga). */
export async function versoesAgentePublicadas(): Promise<string[]> {
  const r = await db
    .select({ versao: agenteReleases.versao, ultima: sql<Date>`max(${agenteReleases.criadoEm})` })
    .from(agenteReleases)
    .where(eq(agenteReleases.ativo, true))
    .groupBy(agenteReleases.versao)
    .orderBy(desc(sql`max(${agenteReleases.criadoEm})`));
  return r.map((x) => x.versao);
}

export async function clientesAtivosParaChave(): Promise<{ id: string; nome: string; documento: string | null }[]> {
  return db
    .select({ id: clientes.id, nome: clientes.nome, documento: clientes.documento })
    .from(clientes)
    .where(eq(clientes.status, "ativo"))
    .orderBy(clientes.nome);
}

/** Ids dos servidores criados pela ativação Hermes (marca `criado_por 'chave:%'`); em lote, para a lista do painel. */
export async function idsServidoresHermes(): Promise<Set<string>> {
  const r = await db
    .select({ servidorId: hermesInstalacoes.servidorId })
    .from(hermesInstalacoes)
    .where(and(isNotNull(hermesInstalacoes.servidorId), like(hermesInstalacoes.criadoPor, PADRAO_LIKE_CRIADOR_CHAVE)));
  return new Set(r.flatMap((x) => (x.servidorId ? [x.servidorId] : [])));
}

/** Instalação Hermes (qualquer origem) de um servidor, para o atalho na tela do servidor. */
export async function instalacaoIdDoServidor(servidorId: string): Promise<string | null> {
  const [i] = await db.select({ id: hermesInstalacoes.id }).from(hermesInstalacoes).where(eq(hermesInstalacoes.servidorId, servidorId)).limit(1);
  return i?.id ?? null;
}

// ── escrita ─────────────────────────────────────────────────────────────────

type EscritaSql = Pick<
  DepsEscritaPainel,
  | "cliente"
  | "instalacaoParaAdocao"
  | "inserirChave"
  | "revogarChaveAberta"
  | "instalacaoSimples"
  | "atualizarCanal"
  | "versaoAlvoServidor"
  | "versaoAgenteExiste"
  | "fixarVersaoAlvo"
  | "instalacoesParaProva"
>;

export const repoEscritaPainel: EscritaSql = {
  async cliente(id) {
    const [c] = await db
      .select({ id: clientes.id, nome: clientes.nome, documento: clientes.documento, status: clientes.status })
      .from(clientes)
      .where(eq(clientes.id, id))
      .limit(1);
    return c ?? null;
  },

  async instalacaoParaAdocao(id) {
    const [i] = await db
      .select({ id: hermesInstalacoes.id, clienteId: hermesInstalacoes.clienteId, servidorId: hermesInstalacoes.servidorId, status: hermesInstalacoes.status })
      .from(hermesInstalacoes)
      .where(eq(hermesInstalacoes.id, id))
      .limit(1);
    return i ?? null;
  },

  async inserirChave(d) {
    return db.transaction(async (tx) => {
      let instalacaoId = d.instalacaoId;
      let instalacaoCriada = false;
      if (d.criarInstalacao) {
        // Serializa as emissões de adoção do MESMO cliente (clique duplo/duas abas): a 2ª espera a 1ª
        // confirmar e então enxerga a instalação criada por ela, em vez de criar outra.
        await tx.select({ id: clientes.id }).from(clientes).where(eq(clientes.id, d.clienteId)).for("update");
        // Reaproveita a órfã mais recente do cliente (sem servidor, aguardando, criada pelo painel):
        // reemitir/revogar/expirar a chave não acumula instalações sem servidor.
        const [orfa] = await tx
          .select({ id: hermesInstalacoes.id })
          .from(hermesInstalacoes)
          .where(
            and(
              eq(hermesInstalacoes.clienteId, d.clienteId),
              isNull(hermesInstalacoes.servidorId),
              eq(hermesInstalacoes.status, "aguardando_ativacao"),
              like(hermesInstalacoes.criadoPor, PADRAO_LIKE_CRIADOR_PAINEL)
            )
          )
          .orderBy(desc(hermesInstalacoes.criadoEm), desc(hermesInstalacoes.id))
          .limit(1);
        if (orfa) {
          // o canal da instalação é o que a adoção usa: segue o escolhido agora; CNPJ idem (o cadastro pode ter mudado)
          await tx
            .update(hermesInstalacoes)
            .set({ canal: d.criarInstalacao.canal, cnpj: d.cnpj, cnpjRaiz: raizCnpj(d.cnpj), atualizadoEm: new Date() })
            .where(eq(hermesInstalacoes.id, orfa.id));
          instalacaoId = orfa.id;
        } else {
          const [inst] = await tx
            .insert(hermesInstalacoes)
            .values({
              clienteId: d.clienteId,
              servidorId: null,
              nome: d.criarInstalacao.nome,
              cnpj: d.cnpj,
              cnpjRaiz: raizCnpj(d.cnpj),
              status: "aguardando_ativacao",
              canal: d.criarInstalacao.canal,
              criadoPor: criadoPorPainel(d.por),
            })
            .returning({ id: hermesInstalacoes.id });
          instalacaoId = inst.id;
          instalacaoCriada = true;
        }
      }
      const [c] = await tx
        .insert(hermesChaves)
        .values({
          tipo: d.tipo,
          clienteId: d.clienteId,
          cnpj: d.cnpj,
          instalacaoId,
          tokenHash: d.hash,
          prefixo: d.prefixo,
          canalInicial: d.canalInicial,
          expiraEm: d.expiraEm,
          criadoPor: d.por,
        })
        .returning({ id: hermesChaves.id });
      return { id: c.id, instalacaoId, instalacaoCriada };
    });
  },

  async revogarChaveAberta(id, por, agora) {
    const [c] = await db
      .update(hermesChaves)
      .set({ revogadaEm: agora, revogadaPor: por })
      .where(and(eq(hermesChaves.id, id), isNull(hermesChaves.usadaEm), isNull(hermesChaves.revogadaEm)))
      .returning({ prefixo: hermesChaves.prefixo, tipo: hermesChaves.tipo, clienteId: hermesChaves.clienteId });
    return c ?? null;
  },

  async instalacaoSimples(id) {
    const [i] = await db
      .select({ id: hermesInstalacoes.id, status: hermesInstalacoes.status, canal: hermesInstalacoes.canal, servidorId: hermesInstalacoes.servidorId, nome: hermesInstalacoes.nome })
      .from(hermesInstalacoes)
      .where(eq(hermesInstalacoes.id, id))
      .limit(1);
    return i ?? null;
  },

  async atualizarCanal(id, canal: CanalHermes) {
    await db.update(hermesInstalacoes).set({ canal, atualizadoEm: new Date() }).where(eq(hermesInstalacoes.id, id));
  },

  async versaoAlvoServidor(servidorId) {
    const [s] = await db.select({ v: servidores.versaoAlvo }).from(servidores).where(eq(servidores.id, servidorId)).limit(1);
    return s?.v ?? null;
  },

  async versaoAgenteExiste(versao) {
    const [r] = await db
      .select({ id: agenteReleases.id })
      .from(agenteReleases)
      .where(and(eq(agenteReleases.versao, versao), eq(agenteReleases.ativo, true)))
      .limit(1);
    return !!r;
  },

  async fixarVersaoAlvo(servidorId, versao) {
    await db.update(servidores).set({ versaoAlvo: versao }).where(eq(servidores.id, servidorId));
  },

  async instalacoesParaProva() {
    return db
      .select({ id: hermesInstalacoes.id, nome: hermesInstalacoes.nome, status: hermesInstalacoes.status, saude: hermesInstalacoes.saude })
      .from(hermesInstalacoes)
      .where(eq(hermesInstalacoes.status, "ativa"));
  },
};
