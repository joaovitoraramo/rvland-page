/* Junta as avaliacoes visuais dos lotes (/tmp/avalN.json) na base
   prospeccao/avaliacoes.json e monta a abordagem de cada lead novo a partir
   dos canais que ele realmente tem. Nao sobrescreve avaliacao ja existente. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const BASE = "prospeccao/avaliacoes.json";
const base = JSON.parse(readFileSync(BASE, "utf8"));

// canais reais de cada dominio, para a abordagem nao mandar o Joao para um
// Instagram que nao existe
const canais = new Map();
for (const arq of [
  "prospeccao/dados.json",
  "prospeccao/dados-geral.json",
  "prospeccao/dados-afluentes.json",
]) {
  if (!existsSync(arq)) continue;
  for (const s of JSON.parse(readFileSync(arq, "utf8"))) {
    if (!s.ok) continue;
    canais.set(s.dominio, {
      ig: s.instagram ? `@${s.instagram}` : null,
      seg: s.igSeguidores ?? null,
      mail: (s.emails ?? [])[0] ?? null,
      nicho: s.nicho ?? "car wash",
      cidade: s.cidade,
    });
  }
}

const TICKET_ALTO = new Set(["med spa", "piscina", "reforma", "odontologia", "roofing"]);

function montarAbordagem(dominio, potencial, diagnostico) {
  const c = canais.get(dominio) ?? {};
  if (potencial <= 3) {
    return "NAO abordar para venda: o site ja e bom (ou e rede/agregador). Use so para seguir e comentar, para entrar no grafo do nicho.";
  }

  let canal;
  if (c.ig && c.mail) {
    canal = `DM no ${c.ig}${c.seg ? ` (${c.seg})` : ""} ou e-mail ${c.mail}`;
  } else if (c.ig) {
    canal = `DM no ${c.ig}${c.seg ? ` (${c.seg})` : ""}. SEM e-mail no site`;
  } else if (c.mail) {
    canal = `E-mail ${c.mail}. SEM Instagram no site`;
  } else {
    canal = "SEM Instagram e SEM e-mail no site: ache o contato no Google Maps/Facebook ou use o formulario do proprio site";
  }

  if (potencial <= 5) {
    return `Morno: so vale se sobrar tempo depois dos quentes. Canal: ${canal}.`;
  }

  const extra = TICKET_ALTO.has(c.nicho)
    ? " Nicho de ticket alto: o valor do site e troco perto do que ele fatura por venda."
    : "";
  const gancho = diagnostico ? ` Gancho: ${diagnostico.split(";")[0].trim()}.` : "";
  return `${canal}.${gancho} Mande a previa da home antes de falar de preco.${extra}`;
}

let novos = 0;
let jaTinha = 0;
for (let i = 1; i <= 8; i++) {
  const arq = `/tmp/aval${i}.json`;
  if (!existsSync(arq)) continue;
  for (const a of JSON.parse(readFileSync(arq, "utf8"))) {
    if (!a?.dominio) continue;
    if (base[a.dominio]) {
      jaTinha++;
      continue;
    }
    base[a.dominio] = {
      potencial: a.potencial,
      notaSite: a.nota_site,
      diagnostico: a.diagnostico,
      abordagem: montarAbordagem(a.dominio, a.potencial, a.diagnostico),
    };
    novos++;
  }
}

writeFileSync(BASE, JSON.stringify(base, null, 2));
const total = Object.keys(base).length;
const quentes = Object.values(base).filter((v) => v.potencial >= 8).length;
const mornos = Object.values(base).filter((v) => v.potencial >= 6 && v.potencial <= 7).length;
console.log(`avaliacoes.json: ${total} dominios (+${novos} novos, ${jaTinha} ja existiam)`);
console.log(`quentes (8-10): ${quentes} | mornos (6-7): ${mornos}`);
