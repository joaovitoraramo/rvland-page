import type { Metadata } from "next";
import { SITE, SITE_URL } from "@/lib/site";
import { RaizHtml } from "@/components/raiz-html";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: SITE.title,
    template: `%s | ${SITE.name}`,
  },

  description: SITE.description,
  applicationName: SITE.name,
  keywords: [...SITE.keywords],

  alternates: {
    canonical: "/",
  },

  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    locale: SITE.locale,
  },

  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  category: "technology",
};

export const viewport = {
  themeColor: "#05070b",
  // safe areas (env(safe-area-inset-*)) só funcionam com viewport-fit=cover
  viewportFit: "cover" as const,
};

export default function LayoutSitePt({ children }: { children: React.ReactNode }) {
  return <RaizHtml lang="pt-BR">{children}</RaizHtml>;
}
