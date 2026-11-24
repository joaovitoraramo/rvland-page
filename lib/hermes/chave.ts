import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * Chave de instalação/adoção do Hermes: aleatória (256 bits), uso único.
 * O banco guarda só o sha256 (token_hash) e os 8 primeiros caracteres
 * (prefixo, só para reconhecer na lista). A chave inteira é mostrada UMA vez.
 */

export const VALIDADE_CHAVE_HORAS = { instalacao: 12, adocao: 24 } as const;

const RE_CHAVE = /^hmk_[A-Za-z0-9_-]{43}$/;

export function hashChaveHermes(chave: string): string {
  return createHash("sha256").update(chave, "utf8").digest("hex");
}

export function gerarChaveHermes(): { chave: string; hash: string; prefixo: string } {
  const chave = "hmk_" + randomBytes(32).toString("base64url");
  return { chave, hash: hashChaveHermes(chave), prefixo: chave.slice(0, 8) };
}

/** Formato barato de checar antes de gastar uma consulta ao banco. */
export function formatoChaveValido(chave: unknown): chave is string {
  return typeof chave === "string" && RE_CHAVE.test(chave);
}

export function expiraEmChave(tipo: "instalacao" | "adocao", agora: Date = new Date()): Date {
  return new Date(agora.getTime() + VALIDADE_CHAVE_HORAS[tipo] * 3600_000);
}

// sem 0/O/1/I: o protocolo é ditado por telefone
const ALFABETO_PROTOCOLO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Protocolo curto da solicitação ("HP-7K3QXM"). A unicidade é garantida pelo banco (retry no repositório). */
export function novoProtocolo(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALFABETO_PROTOCOLO[randomInt(ALFABETO_PROTOCOLO.length)];
  return `HP-${s}`;
}
