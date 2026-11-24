import { config } from "dotenv";
config({ path: ".env.local" });

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assinar, verificar } from "../lib/crypto/ed25519";
import { SITE_URL } from "../lib/site";
import {
  BUCKET_INSTALADOR,
  CHAVE_CONFIG_INSTALADOR,
  comandoBuild,
  executarPublicacao,
  lerArgsPublicar,
  montarLdflags,
  planoPublicacao,
  resolverGarble,
  type ArchInstalador,
} from "./publicar-instalador-montador";

/**
 * Publica o instalador do Hermes (agent/hermesinstalador). Uso:
 *   npx tsx scripts/publicar-instalador.ts <versao>              # DRY-RUN (padrão): só o plano
 *   npx tsx scripts/publicar-instalador.ts <versao> --publicar   # compila, assina, sobe e grava
 * O dry-run não compila, não lê a chave privada e não fala com Storage/banco.
 * Com --publicar: build linux amd64/arm64 (CGO_ENABLED=0, garble OBRIGATÓRIO; GARBLE_BIN=off
 * falha), sha256 + assinatura de release (chaves/release.key, a MESMA do agente), upload no bucket
 * `hermes-instalador` SEM sobrescrever e `configuracoes.hermes_instalador`. Upload parcial é
 * removido (só o que esta execução subiu).
 */
const GO = process.env.GO_BIN || "go";

async function main() {
  const args = lerArgsPublicar(process.argv.slice(2));
  const plano = planoPublicacao({ versao: args.versao, baseURL: SITE_URL, publicar: args.publicar });
  if (!args.publicar) {
    console.log(plano.join("\n"));
    console.log("\nDRY-RUN: nada foi compilado, assinado, enviado ou gravado. Use --publicar para publicar.");
    return;
  }
  if (!existsSync("agent/go.mod")) throw new Error("módulo Go não encontrado em agent/");
  const garble = resolverGarble(process.env, () => execFileSync(GO, ["env", "GOPATH"], { encoding: "utf8" }).trim(), existsSync);
  const releaseSk = readFileSync("chaves/release.key", "utf8").trim();
  const releasePub = readFileSync("chaves/release.pub", "utf8").trim();
  const ldflags = montarLdflags({ versao: args.versao, baseURL: SITE_URL, releasePub });

  const [{ db, configuracoes }, { supabaseAdmin }] = await Promise.all([import("../lib/db"), import("../lib/supabase/admin")]);
  const storage = supabaseAdmin().storage.from(BUCKET_INSTALADOR);
  const dir = mkdtempSync(join(tmpdir(), "hermesinstalador-"));
  try {
    const valor = await executarPublicacao(args.versao, {
      async compilar(arch: ArchInstalador) {
        const saida = join(dir, `hermesinstalador-${arch}`);
        const c = comandoBuild({ arch, ldflags, saida, go: GO, garble });
        console.log(`compilando linux/${arch} (garble)...`);
        execFileSync(c.bin, c.args, { cwd: c.cwd, env: { ...process.env, ...c.env }, stdio: "inherit" });
        return readFileSync(saida);
      },
      assinar(bin: Buffer) {
        const assinatura = assinar(bin, releaseSk);
        if (!verificar(bin, assinatura, releasePub)) throw new Error("assinatura não confere com chaves/release.pub");
        return assinatura;
      },
      async enviar(caminho: string, bin: Buffer) {
        const up = await storage.upload(caminho, bin, { contentType: "application/octet-stream", upsert: false });
        if (up.error) throw new Error(`upload ${caminho}: ${up.error.message}`);
        console.log(`  ${caminho}: ${(bin.length / 1e6).toFixed(1)}MB enviado`);
      },
      async remover(caminhos: string[]) {
        const r = await storage.remove(caminhos);
        console.error(r.error ? `ATENÇÃO: não consegui remover ${caminhos.join(", ")}: ${r.error.message}` : `removidos (upload parcial desta execução): ${caminhos.join(", ")}`);
      },
      async gravarConfig(v) {
        await db
          .insert(configuracoes)
          .values({ chave: CHAVE_CONFIG_INSTALADOR, valor: v })
          .onConflictDoUpdate({ target: configuracoes.chave, set: { valor: v, atualizadoEm: new Date() } });
      },
    });
    console.log(`\nInstalador ${args.versao} publicado (${Object.keys(valor.binarios).join(", ")}).`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
