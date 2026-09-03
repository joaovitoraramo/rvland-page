/* Publica os screenshots da varredura no bucket privado 'prints' do Supabase,
   para o painel mostrar a prova visual do diagnóstico.
   Uso: npx tsx scripts/subir-prints.ts */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { readdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "prints";
const PASTA = "prospeccao/fotos";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes");

  const supabase = createClient(url, chave, { auth: { persistSession: false } });

  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (error) throw error;
    console.log(`bucket '${BUCKET}' criado (privado)`);
  }

  const arquivos = readdirSync(PASTA).filter((f) => f.endsWith(".png"));
  console.log(`enviando ${arquivos.length} prints...`);

  let enviados = 0;
  let falhas = 0;
  for (const arquivo of arquivos) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(arquivo, readFileSync(`${PASTA}/${arquivo}`), {
        contentType: "image/png",
        upsert: true,
      });
    if (error) {
      falhas++;
      console.error(`  falhou ${arquivo}: ${error.message}`);
    } else {
      enviados++;
      if (enviados % 25 === 0) console.log(`  ${enviados}/${arquivos.length}`);
    }
  }

  console.log(`\nprints publicados: ${enviados} | falhas: ${falhas}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
