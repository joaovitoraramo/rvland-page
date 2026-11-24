import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { gerarParEd25519 } from "../lib/crypto/ed25519";
import { removerChavesVazias, temValorNoEnv } from "../lib/hermes/env-chaves";

/**
 * Gera os pares Ed25519 da Fase 2 (e o do Hermes). Idempotente e conservador: NUNCA
 * sobrescreve chave existente (regenerar a de licença invalida os leases já
 * emitidos; regenerar a de release órfã os binários publicados).
 *
 *   Licença → RVLAND_LICENSE_SK/PK no .env.local (a SK também vai na Vercel).
 *   Release → chaves/release.key (privada, SUA guarda) + chaves/release.pub.
 *   Hermes  → RVLAND_HERMES_SK/PK (kid "h1") no .env.local: assina o documento de
 *             licença do Hermes. Par PRÓPRIO, distinto do da licença (Credit/Pic Price).
 *
 * Nunca imprime chave privada: só grava no .env.local (como a de licença).
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

// ── Hermes (runtime, vai na Vercel; kid "h1") ────────────────────────────────
const envAposLicenca = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

// "existe" = com valor (`^RVLAND_HERMES_SK=.+`); a linha vazia herdada do .env.example vale como ausente
if (temValorNoEnv(envAposLicenca, "RVLAND_HERMES_SK")) {
  AVISOS.push("RVLAND_HERMES_SK já está no .env.local — mantido.");
} else {
  const hermes = gerarParEd25519();
  const bloco = [
    "",
    "# ── Hermes: licença (kid h1) ───────────────────────────────────────────",
    "# Assina o documento de licença do Hermes. Replicar SK na Vercel (Production);",
    "# a PK vai embutida no container/agente. NUNCA reutilizar a chave de licença.",
    `RVLAND_HERMES_SK=${hermes.privadaB64}`,
    `RVLAND_HERMES_PK=${hermes.publicaB64}`,
    "",
  ].join("\n");
  // tira as linhas vazias (do .env.example) para o bloco gerado não duplicar a chave
  const limpo = removerChavesVazias(envAposLicenca, ["RVLAND_HERMES_SK", "RVLAND_HERMES_PK"]);
  writeFileSync(envPath, limpo + bloco);
  AVISOS.push("RVLAND_HERMES_SK/PK (kid h1) adicionadas ao .env.local.");
}

console.log("Chaves:");
for (const a of AVISOS) console.log("  - " + a);
console.log("\nPróximos passos:");
console.log("  1. Backup de chaves/release.key num lugar seguro e offline.");
console.log("  2. Na Vercel (Production): RVLAND_LICENSE_SK e RVLAND_LICENSE_PK.");
console.log("  3. Hermes: na Vercel (Production) RVLAND_HERMES_SK; a RVLAND_HERMES_PK vai no container/agente (kid h1).");
console.log("  4. A pública da release está em chaves/release.pub (vai embutida no agente).");
