CREATE TABLE "hermes_chaves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"cnpj" varchar(14),
	"instalacao_id" uuid,
	"token_hash" text NOT NULL,
	"prefixo" varchar(8) NOT NULL,
	"canal_inicial" text DEFAULT 'stable' NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usada_em" timestamp with time zone,
	"usada_ip" text,
	"usada_fingerprint" jsonb,
	"resultado_instalacao_id" uuid,
	"revogada_em" timestamp with time zone,
	"revogada_por" text,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hermes_chaves_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "hermes_instalacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"servidor_id" uuid,
	"nome" text NOT NULL,
	"cnpj" varchar(14),
	"cnpj_raiz" varchar(8),
	"identificacao" jsonb,
	"origem_identificacao" text,
	"status" text DEFAULT 'aguardando_ativacao' NOT NULL,
	"canal" text DEFAULT 'stable' NOT NULL,
	"enforcement" text DEFAULT 'herdar' NOT NULL,
	"versao" text,
	"sha" text,
	"digest" text,
	"canal_em_uso" text,
	"saude" jsonb,
	"fingerprint" jsonb,
	"ultimo_ts_agente" timestamp with time zone,
	"relogio_offset_ms" integer,
	"clone_suspeito_em" timestamp with time zone,
	"ultimo_doc_emitido_em" timestamp with time zone,
	"ultimo_estado_em" timestamp with time zone,
	"ativada_em" timestamp with time zone,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hermes_instalacoes_servidor_id_unique" UNIQUE("servidor_id")
);
--> statement-breakpoint
CREATE TABLE "hermes_licencas" (
	"cliente_id" uuid PRIMARY KEY NOT NULL,
	"contrato_id" uuid,
	"independe_financeiro" boolean DEFAULT false NOT NULL,
	"renovacao_dias" integer DEFAULT 30 NOT NULL,
	"bloqueio_manual" boolean DEFAULT false NOT NULL,
	"bloqueio_motivo" text,
	"bloqueado_por" text,
	"bloqueado_em" timestamp with time zone,
	"dias_confianca" integer DEFAULT 0 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hermes_limites" (
	"chave" text NOT NULL,
	"janela" timestamp with time zone NOT NULL,
	"contagem" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "hermes_limites_chave_janela_pk" PRIMARY KEY("chave","janela")
);
--> statement-breakpoint
CREATE TABLE "hermes_solicitacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocolo" text NOT NULL,
	"cnpj" varchar(14) NOT NULL,
	"cnpj_raiz" varchar(8) NOT NULL,
	"identificacao" jsonb,
	"fingerprint" jsonb NOT NULL,
	"origem_identificacao" text,
	"ip_origem" text,
	"versao_instalador" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"cliente_provavel_id" uuid,
	"tentativas" integer DEFAULT 1 NOT NULL,
	"primeira_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvida_por" text,
	"resolvida_em" timestamp with time zone,
	"motivo" text,
	CONSTRAINT "hermes_solicitacoes_protocolo_unique" UNIQUE("protocolo")
);
--> statement-breakpoint
ALTER TABLE "hermes_chaves" ADD CONSTRAINT "hermes_chaves_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hermes_chaves" ADD CONSTRAINT "hermes_chaves_instalacao_id_hermes_instalacoes_id_fk" FOREIGN KEY ("instalacao_id") REFERENCES "public"."hermes_instalacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hermes_chaves" ADD CONSTRAINT "hermes_chaves_resultado_instalacao_id_hermes_instalacoes_id_fk" FOREIGN KEY ("resultado_instalacao_id") REFERENCES "public"."hermes_instalacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hermes_instalacoes" ADD CONSTRAINT "hermes_instalacoes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hermes_instalacoes" ADD CONSTRAINT "hermes_instalacoes_servidor_id_servidores_id_fk" FOREIGN KEY ("servidor_id") REFERENCES "public"."servidores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hermes_licencas" ADD CONSTRAINT "hermes_licencas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hermes_licencas" ADD CONSTRAINT "hermes_licencas_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hermes_solicitacoes" ADD CONSTRAINT "hermes_solicitacoes_cliente_provavel_id_clientes_id_fk" FOREIGN KEY ("cliente_provavel_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hermes_chaves_expira_idx" ON "hermes_chaves" USING btree ("expira_em") WHERE "hermes_chaves"."usada_em" is null and "hermes_chaves"."revogada_em" is null;--> statement-breakpoint
CREATE INDEX "hermes_instalacoes_cliente_idx" ON "hermes_instalacoes" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "hermes_instalacoes_cnpj_raiz_idx" ON "hermes_instalacoes" USING btree ("cnpj_raiz");--> statement-breakpoint
CREATE UNIQUE INDEX "hermes_solicitacoes_cnpj_maquina_uidx" ON "hermes_solicitacoes" USING btree ("cnpj",coalesce("fingerprint"->>'machine_id_hash', ''));--> statement-breakpoint
CREATE INDEX "hermes_solicitacoes_status_idx" ON "hermes_solicitacoes" USING btree ("status");