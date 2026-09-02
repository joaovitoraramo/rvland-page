/* Junta dados.json + dados-geral.json + avaliações visuais do Claude e gera
   prospeccao/planilha-leads.csv ordenada por potencial (1-10). */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const BASE = JSON.parse(readFileSync("prospeccao/avaliacoes.json", "utf8"));

/** Abordagem padrao para quem nao tem linha propria, derivada do potencial. */
function abordagemPadrao(pot, temIg, temMail, ig) {
  if (pot <= 3) return "NAO abordar para venda: o site ja e bom (ou e rede grande com agencia). Use so para seguir e comentar, para entrar no grafo do nicho.";
  if (pot <= 5) {
    const canal = temIg ? `DM em ${ig}` : temMail ? "e-mail do site" : "buscar contato no Maps";
    return `Morno: so vale se sobrar tempo depois dos quentes. Canal: ${canal}.`;
  }
  const canal = temIg ? `DM em ${ig}` : temMail ? "e-mail do site" : "buscar contato no Google Maps/Facebook";
  return `Canal: ${canal}. Mande a previa da home antes de falar de preco.`;
}

const FRANQUIA_NACIONAL = new Set([
  "groundsguys.com", "mrroof.com", "mollymaid.com", "merrymaids.com",
  "anytimefitness.com", "maidthis.com", "modern-maids.com", "cleanaffinity.com",
  "furryland.us", "limepainting.com", "dollarfence.com", "cleopatraink.com",
  "villasport.com", "lawnstarter.com", "lawnlove.com", "detail.com",
]);

const arquivos = [
  { caminho: "prospeccao/dados.json", perfil: "Média" },
  { caminho: "prospeccao/dados-geral.json", perfil: "Média" },
  { caminho: "prospeccao/dados-afluentes.json", perfil: "Afluente" },
];
const linhas = [];
const vistos = new Set();

for (const { caminho, perfil } of arquivos) {
  if (!existsSync(caminho)) continue;
  for (const s of JSON.parse(readFileSync(caminho, "utf8"))) {
    if (!s.ok || s.descartado || vistos.has(s.dominio)) continue;
    vistos.add(s.dominio);
    if (FRANQUIA_NACIONAL.has(s.dominio)) continue;
    const av = BASE[s.dominio];
    if (!av) continue; // sem avaliacao visual = fora da planilha
    const { potencial, notaSite, diagnostico: obs } = av;
    linhas.push({
      potencial,
      perfilCidade: perfil,
      negocio: (s.titulo ?? s.nomeBusca ?? s.dominio).split("|")[0].split(" - ")[0].split(" – ")[0].trim().slice(0, 40),
      nicho: s.nicho ?? "car wash",
      cidade: s.cidade,
      site: s.dominio,
      notaSite,
      builder: s.builder,
      booking: s.temBooking ? "sim" : "nao",
      ano: s.anoCopyright ?? "",
      instagram: s.instagram ? "@" + s.instagram : "",
      seguidores: s.igSeguidores ?? "",
      emails: (s.emails ?? []).join(" / "),
      obs,
      abordagem: av.abordagem ?? abordagemPadrao(potencial, Boolean(s.instagram), Boolean((s.emails ?? []).length), s.instagram ? "@" + s.instagram : ""),
      foto: s.foto ?? "",
    });
  }
}

linhas.sort((a, b) => b.potencial - a.potencial || a.nicho.localeCompare(b.nicho));

const cab = ["potencial", "negocio", "nicho", "cidade", "perfil_cidade", "site", "nota_site", "builder", "booking", "ano_copyright", "instagram", "seguidores_ig", "emails", "diagnostico_site", "como_abordar", "screenshot"];
const esc = (v) => `"${String(v).replaceAll('"', '""')}"`;
const csv = [cab.join(",")]
  .concat(linhas.map((l) => [l.potencial, l.negocio, l.nicho, l.cidade, l.perfilCidade, l.site, l.notaSite, l.builder, l.booking, l.ano, l.instagram, l.seguidores, l.emails, l.obs, l.abordagem, l.foto].map(esc).join(",")))
  .join("\n");

writeFileSync("prospeccao/planilha-leads.csv", "﻿" + csv);
console.log(`planilha-leads.csv: ${linhas.length} leads (${linhas.filter((l) => l.potencial >= 6).length} com potencial >= 6, ${linhas.filter((l) => l.emails).length} com email)`);
