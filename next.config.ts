import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // conceitos de venda vivem em public/c/<slug>.html; a URL limpa /c/<slug>
    // é o que vai no e-mail para o prospect
    return [{ source: "/c/:slug", destination: "/c/:slug.html" }];
  },
};

export default nextConfig;
