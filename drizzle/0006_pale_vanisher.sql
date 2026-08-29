CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origem" text NOT NULL,
	"nome" text NOT NULL,
	"negocio" text,
	"site_atual" text,
	"canal" text NOT NULL,
	"contato" text NOT NULL,
	"mensagem" text NOT NULL,
	"status" text DEFAULT 'novo' NOT NULL,
	"notas" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "leads_origem_status_idx" ON "leads" USING btree ("origem","status");