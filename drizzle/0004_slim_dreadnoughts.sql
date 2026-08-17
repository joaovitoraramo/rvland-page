ALTER TABLE "agente_releases" DROP CONSTRAINT "agente_releases_versao_unique";--> statement-breakpoint
ALTER TABLE "agente_releases" ADD COLUMN "arch" text DEFAULT 'amd64' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agente_releases_versao_arch_unq" ON "agente_releases" USING btree ("versao","arch");