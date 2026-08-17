CREATE TABLE "anexos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"contrato_id" uuid,
	"nome_arquivo" text NOT NULL,
	"caminho_storage" text NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"enviado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ator_id" uuid,
	"ator_nome" text NOT NULL,
	"acao" text NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" text,
	"detalhes" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"razao_social" text,
	"documento" text,
	"email" text,
	"telefone" text,
	"notas" text,
	"status" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contratos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"modelo_cobranca" text DEFAULT 'fixo' NOT NULL,
	"dia_vencimento" integer,
	"valor_minimo_centavos" integer,
	"tolerancia_dias" integer DEFAULT 4 NOT NULL,
	"status" text DEFAULT 'ativo' NOT NULL,
	"inicio" date NOT NULL,
	"fim" date,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contratos_precos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contrato_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"vigente_desde" date NOT NULL,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contrato_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"competencia" date NOT NULL,
	"vencimento" date NOT NULL,
	"valor_centavos" integer NOT NULL,
	"pago_centavos" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'aberta' NOT NULL,
	"historica" boolean DEFAULT false NOT NULL,
	"notas" text,
	"quitada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grupos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"todas_permissoes" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grupos_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "grupos_permissoes" (
	"grupo_id" uuid NOT NULL,
	"permissao" text NOT NULL,
	CONSTRAINT "grupos_permissoes_grupo_id_permissao_pk" PRIMARY KEY("grupo_id","permissao")
);
--> statement-breakpoint
CREATE TABLE "licencas" (
	"cliente_id" uuid PRIMARY KEY NOT NULL,
	"dias_confianca" integer DEFAULT 0 NOT NULL,
	"bloqueio_manual" boolean DEFAULT false NOT NULL,
	"bloqueio_motivo" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fatura_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"pago_em" date NOT NULL,
	"forma" text,
	"notas" text,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perfis" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"grupo_id" uuid NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfis_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos_precos" ADD CONSTRAINT "contratos_precos_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_permissoes" ADD CONSTRAINT "grupos_permissoes_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licencas" ADD CONSTRAINT "licencas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_fatura_id_faturas_id_fk" FOREIGN KEY ("fatura_id") REFERENCES "public"."faturas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfis" ADD CONSTRAINT "perfis_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anexos_cliente_idx" ON "anexos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "auditoria_entidade_idx" ON "auditoria" USING btree ("entidade","entidade_id");--> statement-breakpoint
CREATE INDEX "contratos_cliente_idx" ON "contratos" USING btree ("cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contratos_precos_vigencia_unq" ON "contratos_precos" USING btree ("contrato_id","vigente_desde");--> statement-breakpoint
CREATE INDEX "faturas_cliente_idx" ON "faturas" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "faturas_competencia_idx" ON "faturas" USING btree ("competencia");--> statement-breakpoint
CREATE UNIQUE INDEX "faturas_contrato_competencia_unq" ON "faturas" USING btree ("contrato_id","competencia");--> statement-breakpoint
CREATE INDEX "pagamentos_fatura_idx" ON "pagamentos" USING btree ("fatura_id");