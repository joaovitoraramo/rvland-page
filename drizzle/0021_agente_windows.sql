DROP INDEX "agente_releases_versao_arch_unq";--> statement-breakpoint
ALTER TABLE "agente_releases" ADD COLUMN "so" text DEFAULT 'linux' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agente_releases_versao_arch_so_unq" ON "agente_releases" USING btree ("versao","arch","so");