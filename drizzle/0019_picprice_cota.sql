ALTER TABLE "picprice_tokens" ADD COLUMN "limite_diario" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "picprice_tokens" ADD COLUMN "uso_dia" date;--> statement-breakpoint
ALTER TABLE "picprice_tokens" ADD COLUMN "uso_qtde" integer DEFAULT 0 NOT NULL;