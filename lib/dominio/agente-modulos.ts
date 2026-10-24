/**
 * Módulos do rvland-agent por servidor. O painel é a fonte da verdade: os
 * módulos vão dentro do lease assinado, e o agente só obedece ao lease.
 *
 *   licenca  — aplica a licença (para/religa os serviços licenciados)
 *   picprice — API local do RV Pic Price (127.0.0.1)
 */
import type { ModulosServidor } from "./lease";

export type { ModulosServidor };

export const ROTULO_MODULO: Record<keyof ModulosServidor, string> = {
  licenca: "Licença",
  picprice: "RV Pic Price",
};

/** "licenca,picprice" — ordem fixa; vazio vira "nenhum". */
export function listaModulos(m: ModulosServidor): string {
  const l = (Object.keys(ROTULO_MODULO) as (keyof ModulosServidor)[]).filter((k) => m[k]);
  return l.length ? l.join(",") : "nenhum";
}

/** "Licença e RV Pic Price" para textos do painel. */
export function descreverModulos(m: ModulosServidor): string {
  const l = (Object.keys(ROTULO_MODULO) as (keyof ModulosServidor)[]).filter((k) => m[k]).map((k) => ROTULO_MODULO[k]);
  if (!l.length) return "nenhum módulo";
  return l.length === 1 ? l[0] : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`;
}

/** Lê os checkboxes `moduloLicenca` / `moduloPicprice` de um formulário. */
export function modulosDoForm(f: FormData): ModulosServidor {
  const marcado = (n: string) => {
    const v = f.get(n);
    return v === "on" || v === "true" || v === "sim";
  };
  return { licenca: marcado("moduloLicenca"), picprice: marcado("moduloPicprice") };
}

/**
 * Comando de instalação. `--modulos` é informativo (o instalador mostra o que
 * vai ser ligado); quem decide é o cadastro do servidor, via lease assinado.
 */
export function comandoInstalacao(p: { siteUrl: string; token: string; modulos: ModulosServidor }): string {
  return (
    `curl -fsSL ${p.siteUrl}/api/agente/instalar | sudo bash -s -- ` +
    `--token=${p.token} --servidor=${p.siteUrl} --modulos=${listaModulos(p.modulos)}`
  );
}
