import { createClient } from "@supabase/supabase-js";

/**
 * Client com service role: admin de usuários (criar/desativar) e Storage
 * (upload/URL assinada). Server-only — jamais importar em componente client.
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
