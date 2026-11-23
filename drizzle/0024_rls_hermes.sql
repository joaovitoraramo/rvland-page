-- RLS nas tabelas do Hermes (app usa conexão direta que bypassa; REST anônima nega). Sem policies.
ALTER TABLE "hermes_licencas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hermes_instalacoes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hermes_chaves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hermes_solicitacoes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hermes_limites" ENABLE ROW LEVEL SECURITY;
