-- RLS ligado, sem policies: a API REST anônima do Supabase nega qualquer
-- acesso. O app usa a conexão direta (DATABASE_URL), que bypassa RLS.
ALTER TABLE "prospeccao" ENABLE ROW LEVEL SECURITY;
