import { verificarHeartbeat } from "@/lib/crypto/heartbeat-auth";

/**
 * Autenticação do download do binário do agente (GET /api/agente/binario).
 *
 * COMPATIBILIDADE (requisito duro): o agente 0.5.0 que roda em produção se
 * autoatualiza baixando o binário SEM autenticação. Enquanto houver 0.5.0 no
 * parque, o download sem credencial CONTINUA sendo aceito (só é marcado como
 * não autenticado, para dar visibilidade). A exigência de credencial fica atrás
 * de um flag (`exigirAuthDownload`) DESLIGADO por padrão; só se liga numa etapa
 * futura, quando nenhum agente 0.5.0 existir mais. Ver PENDÊNCIA no fim.
 *
 * Duas credenciais válidas, ambas já existentes no fluxo do agente:
 *  - "enroll": instalação nova — o instalador tem o token de enroll de uso único
 *    e o manda no header X-RVLand-Enroll (o enroll em si ainda consome o token
 *    depois; aqui só validamos que ele casa com um servidor pendente).
 *  - "assinatura": update de um agente em operação — o agente assina o pedido
 *    com a mesma chave do heartbeat (X-RVLand-Servidor / -Timestamp /
 *    -Assinatura), sobre a mensagem canônica `download:<versao>:<arch>`.
 */

export type MetodoDownload = "assinatura" | "enroll" | "nenhuma";

/** Mensagem canônica assinada no pedido de download (o agente usa a mesma). */
export function mensagemDownload(versao: string, arch: string): string {
  return `download:${versao}:${arch}`;
}

/**
 * Flag de transição: quando `true`, download sem credencial válida é recusado
 * com 401. Padrão DESLIGADO — só ligar quando não houver mais agente 0.5.0.
 */
export function exigirAuthDownload(): boolean {
  const v = (process.env.RVLAND_EXIGIR_AUTH_DOWNLOAD ?? "").trim().toLowerCase();
  return v === "1" || v === "on" || v === "true";
}

export interface PedidoDownload {
  versao: string;
  arch: string;
  servidorId: string;
  timestamp: string;
  assinatura: string;
  enrollToken: string;
  agora?: number;
}

export interface DepsDownload {
  /** servidor ativo (id + pubkey), para validar a assinatura do update. */
  servidorAtivo: (id: string) => Promise<{ id: string; agentePubkey: string | null } | null>;
  /** servidor pendente cujo token de enroll (não expirado) casa com `token`. */
  servidorPorEnroll: (token: string) => Promise<{ id: string } | null>;
}

export interface ResultadoDownload {
  metodo: MetodoDownload;
  servidorId: string | null;
}

/**
 * Classifica a credencial do pedido. Não decide 200/401 — isso é do chamador,
 * combinando com `exigirAuthDownload()`.
 */
export async function autenticarDownload(
  p: PedidoDownload,
  deps: DepsDownload
): Promise<ResultadoDownload> {
  // 1) assinatura (agente em operação se atualizando)
  if (p.servidorId && p.timestamp && p.assinatura) {
    const s = await deps.servidorAtivo(p.servidorId);
    if (
      s?.agentePubkey &&
      verificarHeartbeat({
        pubkeyB64: s.agentePubkey,
        timestamp: p.timestamp,
        rawBody: mensagemDownload(p.versao, p.arch),
        assinaturaB64: p.assinatura,
        agora: p.agora,
      })
    ) {
      return { metodo: "assinatura", servidorId: s.id };
    }
  }

  // 2) token de enroll (instalação nova)
  if (p.enrollToken) {
    const s = await deps.servidorPorEnroll(p.enrollToken);
    if (s) return { metodo: "enroll", servidorId: s.id };
  }

  return { metodo: "nenhuma", servidorId: null };
}

/*
 * PENDÊNCIA (não fazer agora): quando todo o parque estiver numa versão do
 * agente que assina/credencia o download, ligar RVLAND_EXIGIR_AUTH_DOWNLOAD e,
 * depois de validado, remover de vez o caminho aberto (metodo "nenhuma" deixa
 * de ser 200). Até lá, aceitar sem credencial é intencional (compat 0.5.0).
 */
