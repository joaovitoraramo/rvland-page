import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { gerarParEd25519 } from "../lib/crypto/ed25519";

/**
 * Gera os dois pares Ed25519 da Fase 2. Idempotente e conservador: NUNCA
 * sobrescreve chave existente (regenerar a de licença invalida os leases já
 * emitidos; regenerar a de release órfã os binários publicados).
 *
 *   Licença → RVLAND_LICENSE_SK/PK no .env.local (a SK também vai na Vercel).
 *   Release → chaves/release.key (privada, SUA guarda) + chaves/release.pub.
 */

const AVISOS: string[] = [];

// ── Release (offline, guarda do João) ────────────────────────────────────────
mkdirSync("chaves", { recursive: true });
if (existsSync("chaves/release.key")) {
  AVISOS.push("chaves/release.key já existe — mantido.");
} else {
  const release = gerarParEd25519();
  writeFileSync("chaves/release.key", release.privadaB64 + "\n", { mode: 0o600 });
  chmodSync("chaves/release.key", 0o600);
  writeFileSync("chaves/release.pub", release.publicaB64 + "\n");
  AVISOS.push("chaves/release.key criada (0600) — FAÇA BACKUP OFFLINE.");
}

// ── Licença (runtime, vai na Vercel) ─────────────────────────────────────────
const envPath = ".env.local";
const envAtual = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

if (envAtual.includes("RVLAND_LICENSE_SK=")) {
  AVISOS.push("RVLAND_LICENSE_SK já está no .env.local — mantido.");
} else {
  const licenca = gerarParEd25519();
  const bloco = [
    "",
    "# ── Fase 2: chaves do agente ──────────────────────────────────────────",
    "# Licença: assina o lease em runtime. Replicar SK e PK na Vercel (Production).",
    `RVLAND_LICENSE_SK=${licenca.privadaB64}`,
    `RVLAND_LICENSE_PK=${licenca.publicaB64}`,
    "",
  ].join("\n");
  writeFileSync(envPath, envAtual + bloco);
  AVISOS.push("RVLAND_LICENSE_SK/PK adicionadas ao .env.local.");
}

console.log("Chaves:");
for (const a of AVISOS) console.log("  - " + a);
console.log("\nPróximos passos:");
console.log("  1. Backup de chaves/release.key num lugar seguro e offline.");
console.log("  2. Na Vercel (Production): RVLAND_LICENSE_SK e RVLAND_LICENSE_PK.");
console.log("  3. A pública da release está em chaves/release.pub (vai embutida no agente).");
