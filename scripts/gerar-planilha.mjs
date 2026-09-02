/* Junta dados.json + dados-geral.json + avaliações visuais do Claude e gera
   prospeccao/planilha-leads.csv ordenada por potencial (1-10). */
import { readFileSync, writeFileSync } from "node:fs";

// dominio → [potencial, notaSite, observação/ângulo]
const AVALIACAO = {
  "macronmobile.com": [9, 2, "Site de 2013 com botoes bisotados; detailing premium (pacotes de USD 350) = tem caixa; redesign completo + booking"],
  "octopuscarwashflorida.com": [8, 3, "Layout anos 2000, logo clipart, fundo de bolhas; 2 unidades familiares; redesign + booking"],
  "pvcarwash.com": [8, 3, "Template generico ~2010, 1 unidade + loja de conveniencia; redesign completo"],
  "curbsidemobiledetailing.com": [8, 3, "No ar desde 2001, layout 2012, embed YouTube antigo; historia forte pra contar num site novo"],
  "championshipmartialarts.com": [8, 3, "Hero quebrado (secao em branco, form solto); multi-unidades em Orlando; consertar = venda facil de mostrar"],
  "purrfectgrooming.pet": [8, 3, "Hero quebrado com sobreposicao de logo; frota adesivada (investe em marca); ATENCAO: sede em Doral/Miami"],
  "choicetreeservicekc.com": [8, 3, "Copyright 2011, template bootstrap velho, form denso; negocio real com 2 telefones"],
  "phoenixautoshop.com": [7, 4, "Divi roxo datado ~2015; oficina familiar desde 1979; email do dono (mickey@) exposto no site"],
  "sciotolandscaping.com": [7, 4, "Template 2012 com foto de banco de imagem; info@ visivel no header"],
  "straightedgepaintingpros.com": [7, 4, "Logo clipart, WP basico; 49 reviews 4.8 = negocio bom com site fraco"],
  "sanantoniofencecompany.net": [7, 4, "Weebly DIY, tipografia generica, fotos reais; dono fez sozinho"],
  "westernhvac.com": [7, 4, "Logo 3D anos 2000, botoes de ticket; desde 1967, Carrier dealer = caixa; decisao pode ser lenta"],
  "allcreaturespetgrooming.com": [7, 4, "Wix DIY com logo duplicado gigante e layout desalinhado; tem booking"],
  "touchlesscarwash.com": [7, 4, "Visual datado, video com texto arial; rede local pequena de Phoenix"],
  "alamofencesa.com": [6, 4, "Layout centrado antigo; customerservice@ exposto; negocio estabelecido"],
  "powerwashproplus.com": [6, 5, "Squarespace generico, logo clipart, hero fraco; facil mostrar upgrade"],
  "bloombakingco.com": [6, 5, "Layout ~2015 (Duda), logo simples; padaria artesanal com IG"],
  "tatsbywes.com": [6, 5, "Artista solo desde 1997; site simples escuro; decisao rapida, IG e a vida do tatuador"],
  "martialartsworldorlando.com": [6, 5, "Logo anos 90, layout mediano; academia local com programas"],
  "ims365hvac.com": [6, 5, "WP generico, hero cru; empresa 25+ anos"],
  "bluswancarwashtampa.com": [6, 5, "GoDaddy DIY, 1 unidade; template razoavel mas generico"],
  "bubbledown.com": [5, 5, "Site ok porem copyright 2016; IG ativo 3.5k; abordagem por relacionamento"],
  "gsfence.com": [5, 5, "Site decente mas email no Gmail (DIY vibe); familia"],
  "buckandsons.com": [5, 5, "Desde 1971, site funcional porem datado; empresa grande familiar"],
  "paintingcharlotte.com": [5, 5, "Logo anos 2000, layout denso; info@ visivel"],
  "serenitynashville.com": [5, 5, "Site limpo mas datado (2022); nail bar bonito"],
  "jetexterior.com": [5, 5, "Wix razoavel, logo fraco; IG 651"],
  "countryclubtreeservice.com": [5, 5, "Desde 1957; template funcional datado-ish"],
  "squeekyscarwash.com": [4, 6, "Template moderno ok; pouca dor aparente"],
  "mclainskc.com": [4, 6, "Squarespace ok, hero com contraste ruim; desde 1945"],
  "functionalidaho.com": [4, 6, "Carregado mas funcional; 630 reviews; familia"],
  "comalfence.com": [4, 6, "Razoavel e funcional"],
  "pressurewashjacksonvillefl.com": [4, 6, "Site ok generico; IG com 0 seguidores = comecando presenca social"],
  "kansascitytreeservices.net": [4, 5, "SUSPEITA de lead-broker: telefone placeholder 816-555-7890 na foto; verificar se e negocio real"],
  "joescarwashes.com": [3, 8, "Site bom; IG com so 57 seguidores (oportunidade social, nao site)"],
  "aquashineexpress.com": [3, 8, "Site moderno bom"],
  "bigdanscarwash.com": [3, 7, "Site moderno; rede regional"],
  "woodieswash.com": [3, 7, "Marca forte, 18+ unidades, IG 10K; provavelmente tem agencia"],
  "aquasoniccarwash.com": [3, 7, "Site moderno"],
  "kctreecareks.com": [3, 7, "Lead-gen competente"],
  "kcarborist.com": [3, 7, "Site ok com badges de rating"],
  "pressurewashinginjacksonvillefl.com": [3, 7, "Moderno decente"],
  "jaxpropressurewash.com": [3, 8, "Site moderno bonito; hello@ exposto"],
  "coraljaxpressurewashing.com": [3, 8, "Site bom com precos claros"],
  "autorepairshopphoenix.com": [3, 7, "Moderno com social proof; desde 1976"],
  "tbirdauto.com": [3, 7, "Moderno com fotos reais da equipe"],
  "foxhvacpro.com": [3, 8, "Moderno, badges 2026"],
  "idahofitnessfactory.com": [3, 7, "Moderno; 10+ unidades"],
  "groombar.com": [3, 7, "Moderno; franchising no menu"],
  "charlottepaintsquad.com": [3, 7, "Lead-gen moderno"],
  "johnsonservicescompany.com": [3, 8, "Grande (4 cidades TX), video no hero"],
  "billraganroofing.com": [2, 9, "Site forte estilo HubSpot com calculadora"],
  "nashvilleroofingco.com": [2, 8, "Moderno forte"],
  "azautoshop.com": [2, 9, "Site excelente"],
  "callpeppy.com": [2, 9, "Branding forte com mascote"],
  "ultrashadetattoos.com": [2, 8, "Site premium chique"],
  "poppyandmonroe.com": [2, 8, "Squarespace minimal chique"],
  "lucasdetailingcolumbus.com": [2, 8, "Moderno bonito"],
  "tidycasa.com": [2, 8, "Moderno com booking 60s"],
  "zoomingroomin.com": [2, 8, "Moderno; escala nacional"],
  "superstarcarwashaz.com": [2, 7, "Rede grande AZ, IG 17K"],
  "fairwaylawns.com": [2, 7, "Rede multi-estado, 78k reviews"],
  "mobiledetailingexpert.com": [2, 8, "Plataforma 80+ cidades, nao local"],
  "tidalwaveautospa.com": [1, 8, "Corporacao 200+ unidades"],
  "autobell.com": [1, 7, "Corporacao 75+ unidades"],
  "mcdanielslawncare.com": [4, 6, "Site razoavel com bug visual no hero; mike@ exposto"],
  "westernhvac.com_dup": [0, 0, ""],
};

const ABORDAGEM = {
  "macronmobile.com": "SEM IG e SEM e-mail no site. Ache 'Macron Mobile Detailing Columbus' no Google Maps/Facebook, ou use o formulário do próprio site. Gancho: mande a prévia junto de 'seu trabalho é premium, o site está em 2013'. Alvo nº1 da lista.",
  "octopuscarwashflorida.com": "SEM canal direto no site. Procure 'Octopus Car Wash' no Maps/Facebook. Gancho: print lado a lado (bolhas e clipart) contra a prévia moderna. 2 unidades familiares = fala com o dono.",
  "pvcarwash.com": "SEM canal direto no site. Buscar no Maps/Facebook. Gancho: 1 unidade + loja de conveniência; prévia com serviços, preços e horário bem visíveis.",
  "curbsidemobiledetailing.com": "DM no @curbsidemobiledetailing (1.583) ou e-mail info@. Gancho: no ar desde 2001 é história forte que o site atual esconde; prévia destacando os 20+ anos.",
  "championshipmartialarts.com": "CUIDADO: os e-mails são de outras franquias. Ache a unidade de Orlando no Maps. Gancho: o hero da home está QUEBRADO (seção em branco com formulário solto); o print é o argumento mais fácil da lista inteira.",
  "purrfectgrooming.pet": "DM no @purrfectgrooming.pet (4.980) ou e-mail contactus@. Gancho: hero quebrado com logo sobreposto; frota adesivada mostra que investem em marca, mas o site não acompanha. Confirme a cidade antes (parece Doral, não Orlando).",
  "choicetreeservicekc.com": "SEM canal direto. Maps/Facebook. Gancho: copyright 2011 e formulário denso; prévia com pedido de orçamento em 3 campos.",
  "phoenixautoshop.com": "E-mail DIRETO DO DONO: mickey@phoenixautoshop.com. Gancho: oficina de família desde 1979 com site Divi roxo de 2015; prévia que respeite a história e mostre agendamento.",
  "touchlesscarwash.com": "SEM canal direto. Maps. Gancho: visual datado com texto em Arial sobre vídeo; rede local pequena de Phoenix.",
  "sanantoniofencecompany.net": "SEM canal direto. Maps/Facebook. Gancho: Weebly feito pelo próprio dono, ele já sabe que o site é fraco; prévia com galeria das cercas reais.",
  "westernhvac.com": "E-mail tom@ ou max@ (parecem os sócios) ou DM @westernhvac (2.281). Gancho: desde 1967 e Carrier dealer, mas logo 3D dos anos 2000. Empresa grande: espere decisão mais lenta.",
  "sciotolandscaping.com": "E-mail info@sciotolandscaping.com. Gancho: template de 2012 usando FOTO DE BANCO DE IMAGEM; prévia com os jardins reais que eles fizeram.",
  "straightedgepaintingpros.com": "E-mail straightedgepp@gmail.com (Gmail = negócio pequeno, o dono lê). Gancho: 49 avaliações 4.8 estrelas e o site não mostra isso em lugar nenhum.",
  "allcreaturespetgrooming.com": "DM no @allcreaturespetgrooming (3.277) ou e-mail info@. Gancho: Wix com logo duplicado gigante e layout desalinhado; print lado a lado resolve a conversa.",
  "bloombakingco.com": "DM no @bloombakingco (4.204). SEM e-mail no site. Gancho: padaria artesanal bonita com site sem graça; prévia com as fotos dos produtos que já postam no IG.",
  "bluswancarwashtampa.com": "E-mail bluswancarwash@gmail.com. Gancho: GoDaddy DIY genérico; prévia com planos e preços claros.",
  "alamofencesa.com": "E-mail customerservice@alamofencesa.com. Gancho: layout centrado antigo. Extra: o IG tem só 88 seguidores, dá pra oferecer site + presença social.",
  "ims365hvac.com": "E-mail service@ims365hvac.com. Gancho: 25+ anos de experiência num WordPress genérico com hero cru.",
  "martialartsworldorlando.com": "DM no @maworlando (1.049) ou e-mail orlandoadmin@. Gancho: logo dos anos 90; prévia com formulário de aula experimental, que é como academia capta.",
  "powerwashproplus.com": "E-mail powerwashproplus@gmail.com. Gancho: Squarespace genérico com logo clipart. O IG tem 7 seguidores: está começando do zero, bom candidato a site + social.",
  "tatsbywes.com": "DM no @wes_tattoos_columbus (11K seguidores!). Gancho: artista solo desde 1997, decisão rápida e sem comitê; IG forte mas site simples, prévia com galeria destacada."
};

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

const arquivos = ["prospeccao/dados.json", "prospeccao/dados-geral.json"];
const linhas = [];
const vistos = new Set();

for (const arq of arquivos) {
  for (const s of JSON.parse(readFileSync(arq, "utf8"))) {
    if (!s.ok || s.descartado || vistos.has(s.dominio)) continue;
    vistos.add(s.dominio);
    if (FRANQUIA_NACIONAL.has(s.dominio)) continue;
    const av = AVALIACAO[s.dominio];
    if (!av) continue; // diretorios e afins que ja filtrei no olho
    const [potencial, notaSite, obs] = av;
    linhas.push({
      potencial,
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
      abordagem: ABORDAGEM[s.dominio] ?? abordagemPadrao(potencial, Boolean(s.instagram), Boolean((s.emails ?? []).length), s.instagram ? "@" + s.instagram : ""),
      foto: s.foto ?? "",
    });
  }
}

linhas.sort((a, b) => b.potencial - a.potencial || a.nicho.localeCompare(b.nicho));

const cab = ["potencial", "negocio", "nicho", "cidade", "site", "nota_site", "builder", "booking", "ano_copyright", "instagram", "seguidores_ig", "emails", "diagnostico_site", "como_abordar", "screenshot"];
const esc = (v) => `"${String(v).replaceAll('"', '""')}"`;
const csv = [cab.join(",")]
  .concat(linhas.map((l) => [l.potencial, l.negocio, l.nicho, l.cidade, l.site, l.notaSite, l.builder, l.booking, l.ano, l.instagram, l.seguidores, l.emails, l.obs, l.abordagem, l.foto].map(esc).join(",")))
  .join("\n");

writeFileSync("prospeccao/planilha-leads.csv", "﻿" + csv);
console.log(`planilha-leads.csv: ${linhas.length} leads (${linhas.filter((l) => l.potencial >= 6).length} com potencial >= 6, ${linhas.filter((l) => l.emails).length} com email)`);
