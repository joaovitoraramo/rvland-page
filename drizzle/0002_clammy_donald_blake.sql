CREATE TABLE "agente_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"versao" text NOT NULL,
	"canal" text DEFAULT 'estavel' NOT NULL,
	"caminho_storage" text NOT NULL,
	"sha256" text NOT NULL,
	"assinatura" text NOT NULL,
	"notas" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agente_releases_versao_unique" UNIQUE("versao")
);
--> statement-breakpoint
CREATE TABLE "comandos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"servidor_id" uuid NOT NULL,
	"servico_id" uuid,
	"verbo" text NOT NULL,
	"estado" text DEFAULT 'pendente' NOT NULL,
	"resultado" jsonb,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"concluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"servidor_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"severidade" text DEFAULT 'info' NOT NULL,
	"mensagem" text NOT NULL,
	"dados" jsonb,
	"reconhecido" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servico_gerenciados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"servidor_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"unidade_systemd" text NOT NULL,
	"licenciado" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"status_reportado" text DEFAULT 'desconhecido' NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servidores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"host" text,
	"so" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"enrollment_token_hash" text,
	"enrollment_expira_em" timestamp with time zone,
	"agente_pubkey" text,
	"agente_versao" text,
	"versao_alvo" text,
	"manutencao_ate" timestamp with time zone,
	"ultimo_contato_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telemetria_atual" (
	"servidor_id" uuid PRIMARY KEY NOT NULL,
	"cpu_pct" integer,
	"memoria_pct" integer,
	"disco_pct" integer,
	"carga1" integer,
	"uptime_seg" integer,
	"payload" jsonb,
	"coletado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telemetria_historico" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"servidor_id" uuid NOT NULL,
	"cpu_pct" integer,
	"memoria_pct" integer,
	"disco_pct" integer,
	"coletado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comandos" ADD CONSTRAINT "comandos_servidor_id_servidores_id_fk" FOREIGN KEY ("servidor_id") REFERENCES "public"."servidores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comandos" ADD CONSTRAINT "comandos_servico_id_servico_gerenciados_id_fk" FOREIGN KEY ("servico_id") REFERENCES "public"."servico_gerenciados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_servidor_id_servidores_id_fk" FOREIGN KEY ("servidor_id") REFERENCES "public"."servidores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servico_gerenciados" ADD CONSTRAINT "servico_gerenciados_servidor_id_servidores_id_fk" FOREIGN KEY ("servidor_id") REFERENCES "public"."servidores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servidores" ADD CONSTRAINT "servidores_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetria_atual" ADD CONSTRAINT "telemetria_atual_servidor_id_servidores_id_fk" FOREIGN KEY ("servidor_id") REFERENCES "public"."servidores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetria_historico" ADD CONSTRAINT "telemetria_historico_servidor_id_servidores_id_fk" FOREIGN KEY ("servidor_id") REFERENCES "public"."servidores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comandos_servidor_idx" ON "comandos" USING btree ("servidor_id","estado");--> statement-breakpoint
CREATE INDEX "eventos_servidor_idx" ON "eventos" USING btree ("servidor_id","criado_em");--> statement-breakpoint
CREATE INDEX "servico_servidor_idx" ON "servico_gerenciados" USING btree ("servidor_id");--> statement-breakpoint
CREATE INDEX "servidores_cliente_idx" ON "servidores" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "telemetria_hist_idx" ON "telemetria_historico" USING btree ("servidor_id","coletado_em");