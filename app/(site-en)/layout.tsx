import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { RaizHtml } from "@/components/raiz-html";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

export const viewport = {
  themeColor: "#05070b",
  // safe areas (env(safe-area-inset-*)) só funcionam com viewport-fit=cover
  viewportFit: "cover" as const,
};

export default function LayoutSiteEn({ children }: { children: React.ReactNode }) {
  return <RaizHtml lang="en">{children}</RaizHtml>;
}
