-- RLS nas tabelas do agente (app usa conexão direta que bypassa; REST anônima nega)
ALTER TABLE "servidores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "servico_gerenciados" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "telemetria_atual" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "telemetria_historico" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "eventos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comandos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agente_releases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Bucket privado para os binários assinados do agente
INSERT INTO storage.buckets (id, name, public)
VALUES ('agentes', 'agentes', false)
ON CONFLICT (id) DO NOTHING;
