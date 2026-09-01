import { CONTACT, SITE_URL } from "@/lib/site";
import { SITE_EN } from "@/lib/site-en";
import type { PricingEn } from "@/lib/dominio/preco-site";

/**
 * JSON-LD da /en: é o formato que buscadores e chats de IA leem para citar
 * preços, serviços e respostas. SÓ FATOS REAIS aqui: avaliação ou contagem
 * de cliente inventada é spam de schema e derruba a confiança em vez de
 * subir. (A landing PT tem o JSON-LD próprio, inline na página.)
 * Sem telephone de propósito: a promessa do site é "no calls".
 */
export function SchemaSiteEn({
  pricing,
  faq,
}: {
  pricing: PricingEn;
  faq: readonly { q: string; a: string }[];
}) {
  const meses = pricing.care.mesesInclusos;
  const ofertas = [
    pricing.planos.full.ativo && {
      "@type": "Offer",
      name: "Custom website, pay in full",
      price: (pricing.planos.full.valorCentavos / 100).toFixed(2),
      priceCurrency: "USD",
      description: `One-time payment. Includes ${meses} months of support and hosting.`,
    },
    pricing.planos.m6.ativo && {
      "@type": "Offer",
      name: "Custom website, 6 monthly payments",
      price: (pricing.planos.m6.valorCentavos / 100).toFixed(2),
      priceCurrency: "USD",
      description: `6 monthly payments. Includes ${meses} months of support and hosting.`,
    },
    pricing.planos.m12.ativo && {
      "@type": "Offer",
      name: "Custom website, 12 monthly payments",
      price: (pricing.planos.m12.valorCentavos / 100).toFixed(2),
      priceCurrency: "USD",
      description: `12 monthly payments. Includes ${meses} months of support and hosting.`,
    },
  ].filter(Boolean);

  const dados = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfessionalService",
        "@id": `${SITE_URL}/en#organization`,
        name: SITE_EN.name,
        description: SITE_EN.description,
        url: `${SITE_URL}/en`,
        email: CONTACT.email,
        areaServed: ["US", "BR"],
        sameAs: [CONTACT.instagram],
        logo: `${SITE_URL}/logo.png`,
        image: `${SITE_URL}/logo.png`,
        knowsLanguage: ["en", "pt-BR"],
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: "Website plans",
          itemListElement: ofertas,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/en#website`,
        url: `${SITE_URL}/en`,
        name: SITE_EN.name,
        inLanguage: "en",
        publisher: { "@id": `${SITE_URL}/en#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/en#faq`,
        inLanguage: "en",
        mainEntity: faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(dados).replace(/</g, "\\u003c"),
      }}
    />
  );
}
