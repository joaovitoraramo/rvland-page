import { formatarDolares } from "@/lib/formato";

/**
 * Conteúdo do site internacional (/en). NÃO é tradução do PT: público
 * diferente (small business americano), oferta diferente (website + booking).
 */

export const SITE_EN = {
  name: "RVLand Devs",
  title: "RVLand Devs | Websites for businesses — no calls, just text",
  description:
    "We design, write, and launch your business website. Approve everything by message — no calls, no meetings. One price, everything included.",
  keywords: [
    "small business website",
    "website design",
    "local business website",
    "car wash website",
    "affordable website design",
    "website with booking",
    "web design no meetings",
  ],
} as const;

export const INCLUDED_EN = [
  {
    title: "Custom design",
    desc: "Built for your business — never a template.",
  },
  {
    title: "Perfect on phones",
    desc: "Most of your customers are on mobile. Your site looks sharp there first.",
  },
  {
    title: "Google Maps & reviews",
    desc: "Show customers where you are and why they should pick you.",
  },
  {
    title: "Contact & booking forms",
    desc: "Customers reach you or request a booking in seconds.",
  },
  {
    title: "Search-engine ready",
    desc: "Clean SEO basics so locals actually find you on Google.",
  },
  {
    title: "Secure (SSL)",
    desc: "The padlock in the browser — trust, built in.",
  },
  {
    title: "Fast hosting",
    desc: "Your site stays fast and online. We handle all of it.",
  },
  {
    title: "Real support",
    desc: "Need a change? Text us. We keep your site fresh.",
  },
] as const;

export const STEPS_EN = [
  {
    title: "Send us your info",
    desc: "Tell us about your business by message: services, photos, hours. We take it from there.",
  },
  {
    title: "Approve your design",
    desc: "We send a live preview to your phone. Ask for changes until you love it.",
  },
  {
    title: "Go live",
    desc: "We launch your site, connect your domain, and keep everything running.",
  },
] as const;

/** FAQ com os valores vivos do pricing (configurável no painel → revalidate). */
export function faqEn(care: { valorCentavos: number; mesesInclusos: number }) {
  const mensal = `${formatarDolares(care.valorCentavos)}/month`;
  return [
    {
      q: "Do I own my website?",
      a: "Yes. Once your plan is paid in full, the site is 100% yours — domain, design, and content.",
    },
    {
      q: "How long does it take?",
      a: "Most sites are ready for your approval within days of getting your info, and live shortly after you approve.",
    },
    {
      q: "Who writes the content?",
      a: "We do. Send us the basics about your business and we write clear, professional copy — you approve every word.",
    },
    {
      q: `What happens after the first ${care.mesesInclusos} months?`,
      a: `Support & hosting continues at ${mensal} — updates, backups, and changes. You can also move your site elsewhere; it's yours.`,
    },
    {
      q: "Why don't you do calls?",
      a: "Because you don't have time for them. We move at the pace of your day — you reply when it suits you, and we never ask you to stop working to sit on a call. Time is money. Everything happens by message: faster for you, documented for both of us. No meetings. No pressure.",
    },
  ] as const;
}
