import { config } from "dotenv";
config({ path: ".env.local" });

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import { db, agenteReleases } from "../lib/db";
import { supabaseAdmin } from "../lib/supabase/admin";
import { assinar } from "../lib/crypto/ed25519";
import { SITE_URL } from "../lib/site";

/**
 * Compila, assina (chave de release OFFLINE) e publica o agente. Uso:
 *   npx tsx scripts/publicar-agente.ts <versao> [canal]
 * Cada arquitetura vira um binário assinado no bucket 'agentes' + linha em
 * agente_releases. A assinatura garante que só binário assinado por VOCÊ é
 * aceito por um agente rodando lá fora.
 */
const ARCHS = ["amd64", "arm64"] as const;
const GO = process.env.GO_BIN || "go";
/**
 * Ofuscação: com o garble instalado (v0.16.0 é a última que aceita o Go 1.26 —
 * `go install mvdan.cc/garble@v0.16.0`), o build sai com nomes e textos
 * embaralhados (-literals -tiny). GARBLE_BIN aponta outro caminho.
 *
 * SEM garble a publicação FALHA por padrão: nunca mandamos para produção um
 * binário sem ofuscação por engano. Para depuração LOCAL dá para liberar o
 * build sem ofuscação de forma explícita, com a flag `--sem-garble` ou
 * `GARBLE_BIN=off` — aí sai um aviso grande e o build segue só com strip.
 */
function garbleBin(): string | null {
  if (process.env.GARBLE_BIN && process.env.GARBLE_BIN !== "off") return process.env.GARBLE_BIN;
  try {
    const gopath = execFileSync(GO, ["env", "GOPATH"], { encoding: "utf8" }).trim();
    const caminho = `${gopath}/bin/garble`;
    return existsSync(caminho) ? caminho : null;
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const semGarble = args.includes("--sem-garble") || process.env.GARBLE_BIN === "off";
  const pos = args.filter((a) => !a.startsWith("--"));
  const versao = pos[0];
  const canal = (pos[1] as "estavel" | "canary") || "estavel";
  if (!versao || !/^\d+\.\d+\.\d+$/.test(versao)) {
    throw new Error("uso: publicar-agente.ts <versao semver> [estavel|canary] [--sem-garble]");
  }

  const releaseSk = readFileSync("chaves/release.key", "utf8").trim();
  const releasePub = readFileSync("chaves/release.pub", "utf8").trim();
  const licensePub = process.env.RVLAND_LICENSE_PK;
  if (!licensePub) throw new Error("RVLAND_LICENSE_PK ausente no .env.local");
  if (!existsSync("agent/go.mod")) throw new Error("módulo do agente não encontrado em agent/");

  // Ofuscação obrigatória: sem garble e sem opt-out explícito, aborta ANTES de
  // compilar — para nunca publicar binário sem ofuscação por engano.
  const garble = garbleBin();
  if (!garble) {
    if (!semGarble) {
      throw new Error(
        "garble não encontrado: a publicação exige ofuscação. Instale com " +
          "`go install mvdan.cc/garble@v0.16.0` ou aponte GARBLE_BIN para o binário. " +
          "Só para depuração LOCAL use --sem-garble (ou GARBLE_BIN=off) — nunca publique assim para produção."
      );
    }
    console.warn(
      "\n" +
        "######################################################################\n" +
        "#  ATENÇÃO: BUILD SEM OFUSCAÇÃO (--sem-garble / GARBLE_BIN=off).      #\n" +
        "#  Binário sai só com strip (-s -w). USO APENAS LOCAL/DEPURAÇÃO.      #\n" +
        "#  NÃO publique este artefato para produção.                         #\n" +
        "######################################################################\n"
    );
  }

  // chaves públicas embutidas no binário (crypto.go, pacote main)
  const ld = [
    "-s",
    "-w",
    `-X main.versao=${versao}`,
    `-X main.defaultEndereco=${SITE_URL}`,
    `-X main.licensePK=${licensePub}`,
    `-X main.releasePK=${releasePub}`,
  ].join(" ");

  const storage = supabaseAdmin().storage.from("agentes");

  for (const arch of ARCHS) {
    const saida = `/tmp/agenterv-${versao}-${arch}`;
    console.log(`compilando ${arch}...`);
    const [bin0, args0] = garble
      ? [garble, ["-literals", "-tiny", "build", "-ldflags", ld, "-o", saida, "."]]
      : [GO, ["build", "-ldflags", ld, "-o", saida, "."]];
    console.log(garble ? "  (ofuscado com garble)" : "  (SEM garble: só strip — não é para produção)");
    execFileSync(bin0, args0, {
      cwd: "agent",
      env: { ...process.env, GOOS: "linux", GOARCH: arch, CGO_ENABLED: "0" },
      stdio: "inherit",
    });

    const bin = readFileSync(saida);
    const sha256 = createHash("sha256").update(bin).digest("hex");
    const assinatura = assinar(bin, releaseSk);
    const caminho = `${versao}/${arch}/agenterv`;

    const up = await storage.upload(caminho, bin, {
      contentType: "application/octet-stream",
      upsert: true,
    });
    if (up.error) throw new Error(`upload ${arch}: ${up.error.message}`);

    await db
      .insert(agenteReleases)
      .values({ versao, arch, canal, caminhoStorage: caminho, sha256, assinatura })
      .onConflictDoUpdate({
        target: [agenteReleases.versao, agenteReleases.arch],
        set: { canal, caminhoStorage: caminho, sha256, assinatura, ativo: true },
      });

    console.log(`  ${arch}: ${(bin.length / 1e6).toFixed(1)}MB sha256=${sha256.slice(0, 12)}… publicado`);
  }

  // histórico é mantido; 'latest' resolve para a versão mais recente do canal
  console.log(`\nAgente ${versao} (${canal}) publicado nas ${ARCHS.length} arquiteturas.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
