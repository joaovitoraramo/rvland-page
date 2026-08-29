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
        | "servidor"
        | "lead"
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

// ─── Fase 2: agente e parque de servidores ──────────────────────────────────

export const servidores = pgTable(
  "servidores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id),
    nome: text("nome").notNull(),
    descricao: text("descricao"),
    host: text("host"), // informativo (IP/hostname); acesso é pelo agente
    so: text("so"), // informativo
    status: text("status")
      .notNull()
      .default("pendente")
      .$type<"pendente" | "ativo" | "revogado">(),
    // enrollment de uso único
    enrollmentTokenHash: text("enrollment_token_hash"),
    enrollmentExpiraEm: timestamp("enrollment_expira_em", { withTimezone: true }),
    // chave pública do agente (base64), definida no enroll — a privada nunca sai do servidor
    agentePubkey: text("agente_pubkey"),
    agenteVersao: text("agente_versao"),
    versaoAlvo: text("versao_alvo"), // fixa canary; null = último estável
    hardware: jsonb("hardware").$type<{
      distro?: string;
      kernel?: string;
      cpu_modelo?: string;
      cpu_nucleos?: number;
      ram_total_mb?: number;
      virtualizacao?: { tipo: string; tecnologia: string };
      discos?: {
        montagem: string;
        dispositivo: string;
        fs: string;
        total_gb: number;
        usado_pct: number;
      }[];
    }>(),
    manutencaoAte: timestamp("manutencao_ate", { withTimezone: true }),
    ultimoContatoEm: timestamp("ultimo_contato_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("servidores_cliente_idx").on(t.clienteId)]
);

export const servicoGerenciados = pgTable(
  "servico_gerenciados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    servidorId: uuid("servidor_id")
      .notNull()
      .references(() => servidores.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(), // rótulo humano
    unidadeSystemd: text("unidade_systemd").notNull(), // ex: concicredit.service
    licenciado: boolean("licenciado").notNull().default(true),
    ativo: boolean("ativo").notNull().default(true),
    statusReportado: text("status_reportado")
      .notNull()
      .default("desconhecido")
      .$type<"ativo" | "inativo" | "desconhecido">(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("servico_servidor_idx").on(t.servidorId)]
);

// 1 linha por servidor, sobrescrita a cada heartbeat (nunca cresce)
export const telemetriaAtual = pgTable("telemetria_atual", {
  servidorId: uuid("servidor_id")
    .primaryKey()
    .references(() => servidores.id, { onDelete: "cascade" }),
  cpuPct: integer("cpu_pct"),
  memoriaPct: integer("memoria_pct"),
  discoPct: integer("disco_pct"),
  carga1: integer("carga1"), // load average * 100
  uptimeSeg: integer("uptime_seg"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  coletadoEm: timestamp("coletado_em", { withTimezone: true }).notNull().defaultNow(),
});

// Histórico curto, podado por cron
export const telemetriaHistorico = pgTable(
  "telemetria_historico",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    servidorId: uuid("servidor_id")
      .notNull()
      .references(() => servidores.id, { onDelete: "cascade" }),
    cpuPct: integer("cpu_pct"),
    memoriaPct: integer("memoria_pct"),
    discoPct: integer("disco_pct"),
    coletadoEm: timestamp("coletado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("telemetria_hist_idx").on(t.servidorId, t.coletadoEm)]
);

export const eventos = pgTable(
  "eventos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    servidorId: uuid("servidor_id")
      .notNull()
      .references(() => servidores.id, { onDelete: "cascade" }),
    tipo: text("tipo")
      .notNull()
      .$type<
        | "servico_caiu"
        | "disco_alto"
        | "reboot"
        | "ssh_login"
        | "agente_online"
        | "agente_offline"
        | "update_aplicado"
        | "update_falhou"
      >(),
    severidade: text("severidade").notNull().default("info").$type<"info" | "aviso" | "critico">(),
    mensagem: text("mensagem").notNull(),
    dados: jsonb("dados").$type<Record<string, unknown>>(),
    reconhecido: boolean("reconhecido").notNull().default(false),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("eventos_servidor_idx").on(t.servidorId, t.criadoEm)]
);

// Fila de comandos: o agente puxa os pendentes no heartbeat
export const comandos = pgTable(
  "comandos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    servidorId: uuid("servidor_id")
      .notNull()
      .references(() => servidores.id, { onDelete: "cascade" }),
    servicoId: uuid("servico_id").references(() => servicoGerenciados.id, {
      onDelete: "cascade",
    }),
    verbo: text("verbo").notNull().$type<"status" | "start" | "stop" | "update">(),
    estado: text("estado")
      .notNull()
      .default("pendente")
      .$type<"pendente" | "enviado" | "concluido" | "falhou">(),
    resultado: jsonb("resultado").$type<Record<string, unknown>>(),
    criadoPor: text("criado_por").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    concluidoEm: timestamp("concluido_em", { withTimezone: true }),
  },
  (t) => [index("comandos_servidor_idx").on(t.servidorId, t.estado)]
);

export const agenteReleases = pgTable(
  "agente_releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versao: text("versao").notNull(), // semver
    arch: text("arch").notNull().default("amd64").$type<"amd64" | "arm64">(),
    canal: text("canal").notNull().default("estavel").$type<"estavel" | "canary">(),
    caminhoStorage: text("caminho_storage").notNull(),
    sha256: text("sha256").notNull(),
    assinatura: text("assinatura").notNull(), // base64, chave de release (offline)
    notas: text("notas"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agente_releases_versao_arch_unq").on(t.versao, t.arch)]
);

// ─── Site público: leads dos formulários (BR e EN) ──────────────────────────

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    origem: text("origem").notNull().$type<"br" | "en">(),
    nome: text("nome").notNull(),
    negocio: text("negocio"),
    siteAtual: text("site_atual"),
    planoInteresse: text("plano_interesse").$type<"full" | "m6" | "m12">(),
    canal: text("canal")
      .notNull()
      .$type<"email" | "sms" | "instagram" | "messenger" | "whatsapp" | "telefone">(),
    contato: text("contato").notNull(),
    mensagem: text("mensagem").notNull(),
    status: text("status")
      .notNull()
      .default("novo")
      .$type<"novo" | "em_conversa" | "proposta" | "ganho" | "perdido">(),
    notas: text("notas"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("leads_origem_status_idx").on(t.origem, t.status)]
);
