/* Amarra um conceito de landing ao prospect: sobe os arquivos para o bucket
   'conceitos' e grava o design system no registro. Se o cliente fechar, a
   direção inteira está lá e ninguém reinventa nada.

   Uso: npx tsx scripts/registrar-conceito.ts <pasta> <dominio>
   Ex.: npx tsx scripts/registrar-conceito.ts conceitos/poolguys azpoolguys.com */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const BUCKET = "conceitos";

const TIPOS: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
  html: "text/html",
};

async function main() {
  const [pasta, dominio] = process.argv.slice(2);
  if (!pasta || !dominio) {
    throw new Error("uso: registrar-conceito.ts <pasta> <dominio>");
  }

  const caminhoJson = `${pasta}/conceito.json`;
  if (!existsSync(caminhoJson)) throw new Error(`não achei ${caminhoJson}`);
  const conceito = JSON.parse(readFileSync(caminhoJson, "utf8"));

  // Sem 'url' o painel não acha as aberturas (o slug sai dela) e o aviso do
  // Telegram não sabe de quem é a visita; sem 'copy' o card fica sem a copy do
  // hero. Registrar pela metade é pior que não registrar, porque parece pronto.
  const faltando = ["url", "cliente", "copy", "arquivos"].filter((k) => !conceito[k]);
  if (faltando.length > 0) {
    throw new Error(
      `${caminhoJson} está sem: ${faltando.join(", ")}. ` +
        `'url' deve ser a URL publicada (https://.../c/<slug>) e 'copy' ` +
        `precisa de { titulo, subtitulo }.`
    );
  }
  if (!/\/c\/[a-z0-9-]+$/.test(conceito.url)) {
    throw new Error(`url do conceito fora do formato .../c/<slug>: ${conceito.url}`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("credenciais do Supabase ausentes");
  const supabase = createClient(url, chave, { auth: { persistSession: false } });

  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (error) throw error;
    console.log(`bucket '${BUCKET}' criado (privado)`);
  }

  for (const arquivo of conceito.arquivos as { rotulo: string; caminho: string }[]) {
    const local = `${pasta}/${basename(arquivo.caminho)}`;
    if (!existsSync(local)) {
      console.log(`  (pulei ${local}, não existe)`);
      continue;
    }
    const ext = local.split(".").pop()!.toLowerCase();
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(arquivo.caminho, readFileSync(local), {
        contentType: TIPOS[ext] ?? "application/octet-stream",
        upsert: true,
      });
    if (error) throw error;
    console.log(`  enviado: ${arquivo.caminho}`);
  }

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const linhas = await sql`
    update prospeccao set conceito = ${sql.json(conceito)}, atualizado_em = now()
    where dominio = ${dominio}
    returning negocio`;
  await sql.end();

  if (linhas.length === 0) throw new Error(`prospect '${dominio}' não encontrado`);
  console.log(`\nconceito amarrado a ${linhas[0].negocio} (${dominio})`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
