import type { Metadata } from "next";
import { RaizHtml } from "@/components/raiz-html";

export const metadata: Metadata = {
  title: { default: "RVLand", template: "%s | RVLand" },
  robots: { index: false, follow: false },
};

export const viewport = {
  themeColor: "#05070b",
  // safe areas (env(safe-area-inset-*)) só funcionam com viewport-fit=cover
  viewportFit: "cover" as const,
};

export default function LayoutApp({ children }: { children: React.ReactNode }) {
  return <RaizHtml lang="pt-BR">{children}</RaizHtml>;
}
