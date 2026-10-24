/**
 * Sistema operacional do servidor (Linux ou Windows) e as regras que mudam com
 * ele: nome do serviço licenciado e textos de ajuda. O SO vem do enroll e do
 * heartbeat do agente.
 */
export type SistemaServidor = "linux" | "windows";

/** "windows", "Windows Server 2019..." → windows; o resto (ou vazio) → linux. */
export function normalizaSO(so: string | null | undefined): SistemaServidor {
  return (so ?? "").trim().toLowerCase().startsWith("windows") ? "windows" : "linux";
}

export const ROTULO_SO: Record<SistemaServidor, string> = { linux: "Linux", windows: "Windows" };

/** Ajuda do campo de serviço licenciado, conforme o SO. */
export function ajudaServico(so: SistemaServidor): { rotulo: string; exemplo: string; ajuda: string } {
  return so === "windows"
    ? {
        rotulo: "Serviço do Windows",
        exemplo: "wildfly",
        ajuda: "Nome do serviço no Gerenciador de Serviços, ex.: wildfly",
      }
    : {
        rotulo: "Unidade systemd",
        exemplo: "credit-back.service",
        ajuda: "Nome da unidade systemd, ex.: credit-back.service",
      };
}

const UNIDADE_SYSTEMD = /^[\w.@-]+\.(service|target|socket|timer)$/;
// Service Name do Windows: sem barra; aceitamos espaço e parênteses porque o
// agente também casa pelo Display Name.
const SERVICO_WINDOWS = /^[^\\/]{1,256}$/;

/** Tira um ".service" que venha por engano num servidor Windows. */
export function normalizaNomeServicoWindows(nome: string): string {
  const n = nome.trim();
  return n.length > ".service".length && n.toLowerCase().endsWith(".service")
    ? n.slice(0, -".service".length).trim()
    : n;
}

export function validarNomeServico(
  nome: string,
  so: SistemaServidor
): { ok: true; valor: string } | { ok: false; erro: string } {
  const bruto = nome.trim();
  if (so === "windows") {
    const valor = normalizaNomeServicoWindows(bruto);
    if (!valor || !SERVICO_WINDOWS.test(valor)) {
      return { ok: false, erro: "Nome de serviço do Windows inválido (ex: wildfly)." };
    }
    return { ok: true, valor };
  }
  if (!UNIDADE_SYSTEMD.test(bruto)) {
    return { ok: false, erro: "Unidade systemd inválida (ex: app.service)." };
  }
  return { ok: true, valor: bruto };
}
