export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://rvland-page.vercel.app";

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

export const CONTACT = {
  whatsapp: "554184891365",
  email: "contato.rvlandd@gmail.com",
} as const;

export const SITE = {
  name: "RVLand Devs",
  tagline: "Realidade Visualizada",
  title: "RVLand Devs | Software sob medida, do zero",
  description:
    "Apps, sites, plataformas e sistemas sob medida — do zero e no seu fluxo. Sem adaptação de software pronto: construímos o produto certo para o seu negócio.",
  locale: "pt_BR",
  keywords: [
    "desenvolvimento de software",
    "software sob medida",
    "criar aplicativo",
    "criar site",
    "plataforma web",
    "sistemas personalizados",
    "next.js",
    "react",
    "rvland devs",
    "mvp",
    "web app",
  ],
} as const;

export const FAQ = [
  {
    q: "Vocês usam software pronto e só adaptam?",
    a: "Não. O produto é construído do zero para o seu fluxo. Podemos reutilizar apenas infra (ex: autenticação) quando faz sentido.",
  },
  {
    q: "Dá para começar pequeno e evoluir depois?",
    a: "Sim. Planejamos um MVP enxuto e evoluímos por etapas, sem precisar refazer tudo.",
  },
  {
    q: "Como eu acompanho o andamento?",
    a: "Com checkpoints e entregas claras. Você valida telas e fluxos enquanto o produto avança.",
  },
  {
    q: "E depois do lançamento?",
    a: "Seguimos com manutenção e melhorias conforme necessidade do negócio.",
  },
] as const;

export function digitsOnly(v: string) {
  return (v || "").replace(/\D/g, "");
}

export function buildWhatsappLink(number: string, text: string) {
  const n = digitsOnly(number);
  if (!n) return "";
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export function buildMailto(email: string, subject: string, body: string) {
  if (!email) return "";
  return `mailto:${email}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

/** Comando de instalação do agente (colar no SSH do servidor). */
export function comandoInstalacaoAgente(token: string, baseUrl = SITE_URL) {
  return `curl -fsSL ${baseUrl}/api/agente/instalar | sudo bash -s -- --token=${token} --servidor=${baseUrl}`;
}
