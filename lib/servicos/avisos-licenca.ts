import "server-only";
import { eq } from "drizzle-orm";

import { db, clientes, configuracoes } from "@/lib/db";
import { setConfig } from "@/lib/config";
import { statusDeClientes } from "@/lib/consultas/licencas";
import { enviarTelegram } from "@/lib/telegram";
import { mensagemLicenca } from "@/lib/dominio/telegram";

const CHAVE = "telegram_licencas";
const NOTIFICAVEIS = new Set(["atrasado", "bloqueado"]);

/**
 * Compara o status de licença de cada cliente ativo com o último estado
 * notificado (configuracoes.telegram_licencas) e avisa só as viradas:
 * → atrasado, → bloqueado, e → em_dia quando vinha de atrasado/bloqueado.
 * Primeira execução (mapa vazio) semeia sem notificar — sem tempestade
 * de mensagens no deploy.
 */
export async function avisarViradasDeLicenca(): Promise<{ enviados: number }> {
  const ativos = await db
    .select({ id: clientes.id, nome: clientes.nome })
    .from(clientes)
    .where(eq(clientes.status, "ativo"));
  if (ativos.length === 0) return { enviados: 0 };

  const statusAtual = await statusDeClientes(ativos.map((c) => c.id));

  const [linha] = await db
    .select()
    .from(configuracoes)
    .where(eq(configuracoes.chave, CHAVE));
  const anterior = (linha?.valor ?? {}) as Record<string, string>;

  const novoMapa: Record<string, string> = {};
  let enviados = 0;

  for (const cliente of ativos) {
    const resultado = statusAtual.get(cliente.id);
    if (!resultado) continue;
    const novo = resultado.status;
    novoMapa[cliente.id] = novo;

    const antes = anterior[cliente.id];
    if (!antes || antes === novo) continue;

    const virouRuim = NOTIFICAVEIS.has(novo);
    const recuperou = novo === "em_dia" && NOTIFICAVEIS.has(antes);
    if (!virouRuim && !recuperou) continue;

    const ok = await enviarTelegram(
      mensagemLicenca({
        nome: cliente.nome,
        idCurto: cliente.id.slice(0, 8),
        novo: novo as "atrasado" | "bloqueado" | "em_dia",
        venceEm: resultado.venceEm,
        toleradoAte: resultado.toleradoAte,
      })
    );
    if (ok) enviados++;
  }

  await setConfig(CHAVE, novoMapa);
  return { enviados };
}
