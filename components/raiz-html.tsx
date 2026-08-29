import { Geist, Geist_Mono } from "next/font/google";
import "@/app/globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Marca que o JS está ativo antes do <body> ser pintado. O CSS usa `.js` para
// só então esconder os blocos de reveal — sem isso a página seria invisível
// para quem não executa JS.
const ENABLE_JS_CLASS = `document.documentElement.classList.add('js')`;

/**
 * Esqueleto <html>/<body> compartilhado pelos três root layouts (site PT,
 * site EN, área logada). O route group define o idioma; o resto é idêntico.
 */
export function RaizHtml({
  lang,
  children,
}: {
  lang: "pt-BR" | "en";
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: o script abaixo adiciona a classe `js` antes
    // da hidratação (mecanismo de reveal da landing) — divergência esperada.
    <html lang={lang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ENABLE_JS_CLASS }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
