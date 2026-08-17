-- RLS ligado em tudo, sem policies: a API REST anônima do Supabase nega
-- qualquer acesso. O app usa a conexão direta (DATABASE_URL), que bypassa RLS.
ALTER TABLE "grupos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "grupos_permissoes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "perfis" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auditoria" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "configuracoes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clientes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contratos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contratos_precos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "faturas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pagamentos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "licencas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "anexos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Bucket privado para contratos anexados (download só por URL assinada)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contratos', 'contratos', false)
ON CONFLICT (id) DO NOTHING;
