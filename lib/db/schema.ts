import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigserial,
  date,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ─── Fase 0: acesso, permissões, auditoria, configurações ───────────────────

export const grupos = pgTable("grupos", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull().unique(),
  descricao: text("descricao"),
  // Dono: concede tudo, inclusive permissões criadas no futuro
  todasPermissoes: boolean("todas_permissoes").notNull().default(false),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const gruposPermissoes = pgTable(
  "grupos_permissoes",
  {
    grupoId: uuid("grupo_id")
      .notNull()
      .references(() => grupos.id, { onDelete: "cascade" }),
    permissao: text("permissao").notNull(),
  },
  (t) => [primaryKey({ columns: [t.grupoId, t.permissao] })]
);

// id = auth.users.id do Supabase
export const perfis = pgTable("perfis", {
  id: uuid("id").primaryKey(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  grupoId: uuid("grupo_id")
    .notNull()
    .references(() => grupos.id),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const auditoria = pgTable(
  "auditoria",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    atorId: uuid("ator_id"),
    atorNome: text("ator_nome").notNull(),
    acao: text("acao").notNull(),
    entidade: text("entidade")
      .notNull()
      .$type<
        | "cliente"
        | "contrato"
        | "fatura"
        | "pagamento"
        | "licenca"
        | "grupo"
        | "usuario"
        | "plataforma"
        | "anexo"
      >(),
    entidadeId: text("entidade_id"),
    detalhes: jsonb("detalhes").$type<Record<string, unknown>>(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auditoria_entidade_idx").on(t.entidade, t.entidadeId)]
);

export const configuracoes = pgTable("configuracoes", {
  chave: text("chave").primaryKey(),
  valor: jsonb("valor").notNull().$type<Record<string, unknown>>(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Fase 1: clientes, contratos, financeiro, licenças ──────────────────────

export const clientes = pgTable("clientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  razaoSocial: text("razao_social"),
  documento: text("documento"),
  email: text("email"),
  telefone: text("telefone"),
  notas: text("notas"),
  status: text("status").notNull().default("ativo").$type<"ativo" | "arquivado">(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const contratos = pgTable(
  "contratos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id),
    tipo: text("tipo").notNull().$type<"recorrente" | "fechado">(),
    titulo: text("titulo").notNull(),
    descricao: text("descricao"),
    modeloCobranca: text("modelo_cobranca").notNull().default("fixo").$type<"fixo" | "por_uso">(),
    // dia do mês (1–28) em que a fatura vence; obrigatório para recorrente
    diaVencimento: integer("dia_vencimento"),
    // piso mensal para modelo por_uso (Credit no futuro)
    valorMinimoCentavos: integer("valor_minimo_centavos"),
    toleranciaDias: integer("tolerancia_dias").notNull().default(4),
    status: text("status").notNull().default("ativo").$type<"ativo" | "encerrado">(),
    inicio: date("inicio").notNull(),
    fim: date("fim"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contratos_cliente_idx").on(t.clienteId)]
);

// Vigências de preço: nunca editar/apagar passado; nova vigência = nova linha
export const contratosPrecos = pgTable(
  "contratos_precos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contratoId: uuid("contrato_id")
      .notNull()
      .references(() => contratos.id, { onDelete: "cascade" }),
    valorCentavos: integer("valor_centavos").notNull(),
    // competência (dia 1º) a partir da qual o valor vale
    vigenteDesde: date("vigente_desde").notNull(),
    criadoPor: text("criado_por").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("contratos_precos_vigencia_unq").on(t.contratoId, t.vigenteDesde)]
);

export const faturas = pgTable(
  "faturas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contratoId: uuid("contrato_id")
      .notNull()
      .references(() => contratos.id),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id),
    competencia: date("competencia").notNull(),
    vencimento: date("vencimento").notNull(),
    valorCentavos: integer("valor_centavos").notNull(),
    pagoCentavos: integer("pago_centavos").notNull().default(0),
    status: text("status").notNull().default("aberta").$type<"aberta" | "quitada" | "cancelada">(),
    // histórica: só registro; nunca afeta licença nem dispara aviso
    historica: boolean("historica").notNull().default(false),
    notas: text("notas"),
    quitadaEm: timestamp("quitada_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("faturas_cliente_idx").on(t.clienteId),
    index("faturas_competencia_idx").on(t.competencia),
    // impede o cron de gerar duas faturas para a mesma competência
    uniqueIndex("faturas_contrato_competencia_unq").on(t.contratoId, t.competencia),
  ]
);

export const pagamentos = pgTable(
  "pagamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    faturaId: uuid("fatura_id")
      .notNull()
      .references(() => faturas.id),
    valorCentavos: integer("valor_centavos").notNull(),
    pagoEm: date("pago_em").notNull(),
    forma: text("forma"),
    notas: text("notas"),
    criadoPor: text("criado_por").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pagamentos_fatura_idx").on(t.faturaId)]
);

// Estado deliberado da licença (o resto é derivado de faturas).
// Linha criada sob demanda; ausência = defaults.
export const licencas = pgTable("licencas", {
  clienteId: uuid("cliente_id")
    .primaryKey()
    .references(() => clientes.id),
  diasConfianca: integer("dias_confianca").notNull().default(0),
  bloqueioManual: boolean("bloqueio_manual").notNull().default(false),
  bloqueioMotivo: text("bloqueio_motivo"),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const anexos = pgTable(
  "anexos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id),
    contratoId: uuid("contrato_id").references(() => contratos.id),
    nomeArquivo: text("nome_arquivo").notNull(),
    caminhoStorage: text("caminho_storage").notNull(),
    tamanhoBytes: integer("tamanho_bytes").notNull(),
    enviadoPor: text("enviado_por").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("anexos_cliente_idx").on(t.clienteId)]
);
