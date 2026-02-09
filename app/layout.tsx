import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteName = "RVLand Devs";
const title = "RVLand Devs | Software sob medida, do zero";
const description =
    "Apps, sites, plataformas e sistemas sob medida — do zero e no seu fluxo. Sem adaptação de software pronto: construímos o produto certo para o seu negócio.";

const url = new URL("https://rvland-page.vercel.app");
const ogImage = "/logo.jpg";

export const metadata: Metadata = {
    metadataBase: url,

    title: {
        default: title,
        template: `%s | ${siteName}`,
    },

    description,
    applicationName: siteName,

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

    alternates: {
        canonical: "/",
    },

    openGraph: {
        type: "website",
        url: "/",
        siteName,
        title,
        description,
        locale: "pt_BR",
        images: [
            {
                url: ogImage,
                alt: `${siteName} — Software sob medida`,
            },
        ],
    },

    twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [ogImage],
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

    icons: {
        icon: [{ url: "/favicon.ico" }],
    },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
