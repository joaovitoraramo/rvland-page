import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Robots com os crawlers de IA explicitamente liberados: é deles que vêm as
 * respostas dos chats. Painel, login e API fora do índice por higiene.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/painel", "/login", "/api/"],
      },
      {
        userAgent: [
          "GPTBot",
          "ChatGPT-User",
          "OAI-SearchBot",
          "ClaudeBot",
          "Claude-Web",
          "anthropic-ai",
          "PerplexityBot",
          "Perplexity-User",
          "Google-Extended",
          "Applebot-Extended",
          "meta-externalagent",
          "CCBot",
        ],
        allow: "/",
        disallow: ["/painel", "/login", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
