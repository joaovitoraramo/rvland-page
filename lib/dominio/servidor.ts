export type StatusServidor = "pendente" | "online" | "offline" | "revogado";

// Um agente saudável bate a cada 60s; 5 min sem contato = silencioso/offline.
const LIMITE_PADRAO_SEG = 5 * 60;

/**
 * Status operacional derivado de um servidor. "offline" num servidor ativo é o
 * sinal de agente silencioso — que na Fase 2 vira risco financeiro (pode não
 * ter recebido uma renovação de licença), então o painel destaca.
 */
export function statusServidor(
  s: { status: "pendente" | "ativo" | "revogado"; ultimoContatoEm: Date | null },
  agoraMs: number = Date.now(),
  limiteSeg: number = LIMITE_PADRAO_SEG
): StatusServidor {
  if (s.status === "revogado") return "revogado";
  if (s.status === "pendente") return "pendente";
  if (!s.ultimoContatoEm) return "offline";
  const idadeSeg = (agoraMs - s.ultimoContatoEm.getTime()) / 1000;
  return idadeSeg <= limiteSeg ? "online" : "offline";
}
