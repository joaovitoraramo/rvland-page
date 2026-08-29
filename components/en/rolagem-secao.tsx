"use client";

import * as React from "react";

/**
 * `/en?section=pricing` rola até a seção — client-side de propósito: ler
 * searchParams no server component tornaria a página dinâmica.
 */
export function RolagemSecao() {
  React.useEffect(() => {
    const secao = new URLSearchParams(window.location.search).get("section");
    if (!secao) return;
    document.getElementById(secao)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return null;
}
