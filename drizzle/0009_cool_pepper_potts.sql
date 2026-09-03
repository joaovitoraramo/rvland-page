CREATE TABLE "prospeccao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dominio" text NOT NULL,
	"negocio" text NOT NULL,
	"nicho" text NOT NULL,
	"cidade" text NOT NULL,
	"perfil_cidade" text DEFAULT 'Média' NOT NULL,
	"site" text NOT NULL,
	"screenshot" text,
	"potencial" integer NOT NULL,
	"nota_site" integer NOT NULL,
	"builder" text,
	"tem_booking" boolean DEFAULT false NOT NULL,
	"ano_copyright" text,
	"instagram" text,
	"seguidores" integer,
	"emails" text,
	"diagnostico" text,
	"como_abordar" text,
	"status" text DEFAULT 'novo' NOT NULL,
	"notas" text,
	"seguido_em" date,
	"comentado_em" date,
	"contatado_em" date,
	"importado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospeccao_dominio_unique" UNIQUE("dominio")
);
--> statement-breakpoint
CREATE INDEX "prospeccao_status_idx" ON "prospeccao" USING btree ("status");--> statement-breakpoint
CREATE INDEX "prospeccao_potencial_idx" ON "prospeccao" USING btree ("potencial");