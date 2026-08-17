import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SITE, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
};

// Marca que o JS está ativo antes do <body> ser pintado. O CSS usa `.js` para
// só então esconder os blocos de reveal — sem isso a página seria invisível
// para quem não executa JS.
const ENABLE_JS_CLASS = `document.documentElement.classList.add('js')`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: o script abaixo adiciona a classe `js` antes
    // da hidratação (mecanismo de reveal da landing) — divergência esperada.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ENABLE_JS_CLASS }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
