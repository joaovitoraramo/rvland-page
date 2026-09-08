CREATE TABLE "cliques_conceito" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"visitante" text NOT NULL,
	"sessao" text NOT NULL,
	"quando" timestamp with time zone DEFAULT now() NOT NULL,
	"rotulo" text NOT NULL,
	"secao" text,
	"destino" text
);
--> statement-breakpoint
CREATE INDEX "cliques_conceito_slug_idx" ON "cliques_conceito" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cliques_conceito_sessao_idx" ON "cliques_conceito" USING btree ("sessao");