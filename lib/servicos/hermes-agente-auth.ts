import { timestampFrescoHermes, verificarPedidoHermes, type RotaAgenteHermes } from "@/lib/hermes/assinatura-agente";
import type { RespostaHttp } from "./hermes-http";
import type { InstalacaoHermes, ServidorAgente } from "./hermes-tipos";

/**
 * Autenticação das rotas do agente para o Hermes: headers X-RVLand-Servidor /
 * -Timestamp / -Assinatura, mas com assinatura de domínio PRÓPRIO sobre
 * `hermes:<rota>:<timestamp>.<sha256(body)>` (ver lib/hermes/assinatura-agente.ts
 * e docs/hermes-protocolo-agente.md). NÃO reutiliza o esquema do heartbeat do Credit.
 *
 * A assinatura é conferida SEM a janela e o frescor é checado depois; assim o
 * 409 RELOGIO só sai para quem provou possuir a chave do servidor (e o agente
 * distingue "relógio errado" de "não autenticado").
 */

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EntradaAgente = {
  servidorId: string;
  timestamp: string;
  assinatura: string;
  rawBody: string;
};

export interface DepsAuthAgente {
  agora(): Date;
  servidorAtivo(id: string): Promise<ServidorAgente | null>;
  instalacaoPorServidor(servidorId: string): Promise<InstalacaoHermes | null>;
}

export type ResultadoAuthAgente =
  | { ok: true; servidor: ServidorAgente; instalacao: InstalacaoHermes; agora: Date; tsAgente: Date }
  | { ok: false; resposta: RespostaHttp };

const naoAutenticado = (): ResultadoAuthAgente => ({
  ok: false,
  resposta: { status: 401, corpo: { erro: "AGENTE_NAO_AUTENTICADO" } },
});

export async function autenticarAgenteHermes(
  e: EntradaAgente,
  rota: RotaAgenteHermes,
  deps: DepsAuthAgente
): Promise<ResultadoAuthAgente> {
  // id não-uuid derrubaria a consulta (500): recusa antes
  if (!RE_UUID.test(e.servidorId)) return naoAutenticado();
  const servidor = await deps.servidorAtivo(e.servidorId);
  if (!servidor?.agentePubkey) return naoAutenticado();

  const t = Date.parse(e.timestamp);
  if (Number.isNaN(t)) return naoAutenticado();
  const assinaturaOk = verificarPedidoHermes({
    rota,
    pubkeyB64: servidor.agentePubkey,
    timestamp: e.timestamp,
    rawBody: e.rawBody,
    assinaturaB64: e.assinatura,
  });
  if (!assinaturaOk) return naoAutenticado();

  const agora = deps.agora();
  if (!timestampFrescoHermes(e.timestamp, agora.getTime())) {
    return {
      ok: false,
      resposta: { status: 409, corpo: { erro: "RELOGIO", agora: agora.toISOString() } },
    };
  }

  const instalacao = await deps.instalacaoPorServidor(servidor.id);
  if (!instalacao || instalacao.status === "desinstalada") {
    return { ok: false, resposta: { status: 404, corpo: { erro: "SEM_INSTALACAO" } } };
  }

  return { ok: true, servidor, instalacao, agora, tsAgente: new Date(t) };
}
