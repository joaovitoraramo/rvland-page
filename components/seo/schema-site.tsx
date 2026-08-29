import { CONTACT, FAQ, SITE, SITE_URL } from "@/lib/site";
import { SITE_EN } from "@/lib/site-en";
import type { PricingEn } from "@/lib/dominio/preco-site";

/**
 * JSON-LD dos sites público PT e EN. É o formato que buscadores e chats de
 * IA leem para citar preços, serviços e respostas. SÓ FATOS REAIS aqui:
 * avaliação/quantidade de cliente inventada é spam de schema e derruba a
 * confiança (e o ranking) em vez de subir.
 */

function Script({ dados }: { dados: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(dados) }}
    />
  );
}

export function SchemaSitePt() {
  const dados = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfessionalService",
        "@id": `${SITE_URL}/#organizacao`,
        name: SITE.name,
        description: SITE.description,
        url: SITE_URL,
        email: CONTACT.email,
        areaServed: "BR",
        knowsLanguage: ["pt-BR", "en"],
      },
      {
        "@type": "WebSite",
        url: SITE_URL,
        name: SITE.name,
        inLanguage: "pt-BR",
      },
      {
        "@type": "FAQPage",
        inLanguage: "pt-BR",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
  return <Script dados={dados} />;
}

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
        knowsLanguage: ["en", "pt-BR"],
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: "Website plans",
          itemListElement: ofertas,
        },
      },
      {
        "@type": "WebSite",
        url: `${SITE_URL}/en`,
        name: SITE_EN.name,
        inLanguage: "en",
      },
      {
        "@type": "FAQPage",
        inLanguage: "en",
        mainEntity: faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
  return <Script dados={dados} />;
}
