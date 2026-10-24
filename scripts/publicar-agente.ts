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
 *   npx tsx scripts/publicar-agente.ts <versao> [canal] [--so=linux,windows]
 * Cada SO × arquitetura vira um binário assinado no bucket 'agentes' + linha em
 * agente_releases (Linux: agenterv; Windows: agenterv.exe). --so limita os SOs
 * (padrão: os dois). A assinatura garante que só binário assinado por VOCÊ é
 * aceito por um agente rodando lá fora.
 */
const ARCHS = ["amd64", "arm64"] as const;
const SOS = ["linux", "windows"] as const;
type SO = (typeof SOS)[number];
const GO = process.env.GO_BIN || "go";
/**
 * Ofuscação: com o garble instalado (v0.16.0 é a última que aceita o Go 1.26 —
 * `go install mvdan.cc/garble@v0.16.0`), o build sai com nomes e textos
 * embaralhados (-literals -tiny). Sem ele, cai no build normal com strip (-s -w).
 * GARBLE_BIN aponta outro caminho; GARBLE_BIN=off desliga.
 */
function garbleBin(): string | null {
  if (process.env.GARBLE_BIN === "off") return null;
  if (process.env.GARBLE_BIN) return process.env.GARBLE_BIN;
  try {
    const gopath = execFileSync(GO, ["env", "GOPATH"], { encoding: "utf8" }).trim();
    const caminho = `${gopath}/bin/garble`;
    return existsSync(caminho) ? caminho : null;
  } catch {
    return null;
  }
}

async function main() {
  const versao = process.argv[2];
  const canal = (process.argv[3] as "estavel" | "canary") || "estavel";
  const argSo = process.argv.find((a) => a.startsWith("--so="));
  const sos: SO[] = argSo
    ? (argSo.slice(5).split(",").filter((x): x is SO => (SOS as readonly string[]).includes(x)) as SO[])
    : [...SOS];
  if (!sos.length) throw new Error("--so inválido (use linux, windows ou linux,windows)");
  if (canal !== "estavel" && canal !== "canary") throw new Error("canal inválido (estavel|canary)");
  if (!versao || !/^\d+\.\d+\.\d+$/.test(versao)) {
    throw new Error("uso: publicar-agente.ts <versao semver> [estavel|canary]");
  }

  const releaseSk = readFileSync("chaves/release.key", "utf8").trim();
  const releasePub = readFileSync("chaves/release.pub", "utf8").trim();
  const licensePub = process.env.RVLAND_LICENSE_PK;
  if (!licensePub) throw new Error("RVLAND_LICENSE_PK ausente no .env.local");
  if (!existsSync("agent/go.mod")) throw new Error("módulo do agente não encontrado em agent/");

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

  for (const so of sos) {
    for (const arch of ARCHS) {
      const nomeBin = so === "windows" ? "agenterv.exe" : "agenterv";
      const saida = `/tmp/agenterv-${versao}-${so}-${arch}${so === "windows" ? ".exe" : ""}`;
      console.log(`compilando ${so}/${arch}...`);
      const garble = garbleBin();
      const [bin0, args0] = garble
        ? [garble, ["-literals", "-tiny", "build", "-ldflags", ld, "-o", saida, "."]]
        : [GO, ["build", "-ldflags", ld, "-o", saida, "."]];
      console.log(garble ? "  (ofuscado com garble)" : "  (sem garble: só strip)");
      execFileSync(bin0, args0, {
        cwd: "agent",
        env: { ...process.env, GOOS: so, GOARCH: arch, CGO_ENABLED: "0" },
        stdio: "inherit",
      });

      const bin = readFileSync(saida);
      const sha256 = createHash("sha256").update(bin).digest("hex");
      const assinatura = assinar(bin, releaseSk);
      // Linux mantém o caminho de sempre; Windows ganha pasta própria
      const caminho = so === "windows" ? `${versao}/windows/${arch}/${nomeBin}` : `${versao}/${arch}/${nomeBin}`;

      const up = await storage.upload(caminho, bin, {
        contentType: "application/octet-stream",
        upsert: true,
      });
      if (up.error) throw new Error(`upload ${so}/${arch}: ${up.error.message}`);

      await db
        .insert(agenteReleases)
        .values({ versao, arch, so, canal, caminhoStorage: caminho, sha256, assinatura })
        .onConflictDoUpdate({
          target: [agenteReleases.versao, agenteReleases.arch, agenteReleases.so],
          set: { canal, caminhoStorage: caminho, sha256, assinatura, ativo: true },
        });

      console.log(`  ${so}/${arch}: ${(bin.length / 1e6).toFixed(1)}MB sha256=${sha256.slice(0, 12)}… publicado`);
    }
  }

  // histórico é mantido; 'latest' resolve para a versão mais recente do canal
  console.log(`\nAgente ${versao} (${canal}) publicado: ${sos.join(" e ")} × ${ARCHS.length} arquiteturas.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
