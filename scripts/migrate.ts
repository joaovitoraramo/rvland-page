import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada (.env.local / .env)");

  // max:1 — migrations exigem uma única conexão, fora do pooler de transação
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  console.log("Aplicando migrations em ./drizzle ...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations aplicadas.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
