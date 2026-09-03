"use client";

import * as React from "react";

export const CHAVE_CONCEITO = "rv-conceito-ref";

/**
 * Quem chega de `/en?ref=<slug>` já viu o conceito pronto — oferecer "get your
 * free concept" de novo seria burro. Marca o documento para o CSS trocar as
 * chamadas e guarda de qual conceito veio, para o lead nascer com a origem.
 *
 * Client-side de propósito: ler searchParams no servidor tornaria a /en
 * dinâmica, e ela precisa continuar estática.
 */
export function AdaptarConceito() {
  React.useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref || !/^[a-z0-9-]{1,60}$/.test(ref)) return;

    document.documentElement.classList.add("veio-de-conceito");
    try {
      sessionStorage.setItem(CHAVE_CONCEITO, ref);
    } catch {
      /* storage bloqueado: a troca de texto continua valendo */
    }
  }, []);

  return null;
}

/** Lê o conceito guardado, para o formulário mandar junto com o lead. */
export function conceitoGuardado(): string | undefined {
  try {
    return sessionStorage.getItem(CHAVE_CONCEITO) ?? undefined;
  } catch {
    return undefined;
  }
}
