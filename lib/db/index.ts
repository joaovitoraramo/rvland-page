import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof criarDb>;

function criarDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  // prepare:false — obrigatório com o transaction pooler do Supabase (PgBouncer)
  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema });
}

// Lazy: o build do Next avalia módulos sem env; a conexão só nasce no 1º uso.
// Cache em globalThis: o hot-reload do dev não abre conexões novas a cada save.
const escopo = globalThis as unknown as { __rvlandDb?: Db };

export const db: Db = new Proxy({} as Db, {
  get(_alvo, prop) {
    escopo.__rvlandDb ??= criarDb();
    return escopo.__rvlandDb[prop as keyof Db];
  },
});

export * from "./schema";
