CREATE TABLE "picprice_cache" (
	"chave" text PRIMARY KEY NOT NULL,
	"dados" jsonb NOT NULL,
	"expira_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "picprice_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"cnpj" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefixo" text NOT NULL,
	"status" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"revogado_em" timestamp with time zone,
	"ultimo_uso_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "picprice_tokens" ADD CONSTRAINT "picprice_tokens_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "picprice_tokens_cliente_uidx" ON "picprice_tokens" USING btree ("cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "picprice_tokens_hash_uidx" ON "picprice_tokens" USING btree ("token_hash");--> statement-breakpoint
-- RLS: o app usa conexão direta (bypassa); a REST anônima do Supabase nega
ALTER TABLE "picprice_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "picprice_cache" ENABLE ROW LEVEL SECURITY;
