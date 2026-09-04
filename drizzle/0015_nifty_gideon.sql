CREATE TABLE "visitas_conceito" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"visitante" text NOT NULL,
	"sessao" text NOT NULL,
	"quando" timestamp with time zone DEFAULT now() NOT NULL,
	"dispositivo" text DEFAULT 'desconhecido' NOT NULL,
	"sistema" text,
	"cidade" text,
	"pais" text,
	"referencia" text,
	"segundos" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "visitas_conceito_slug_idx" ON "visitas_conceito" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "visitas_conceito_quando_idx" ON "visitas_conceito" USING btree ("quando");--> statement-breakpoint
CREATE UNIQUE INDEX "visitas_conceito_sessao_idx" ON "visitas_conceito" USING btree ("sessao");