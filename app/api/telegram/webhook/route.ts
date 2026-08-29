import { NextResponse } from "next/server";

import { enviarTelegram } from "@/lib/telegram";
import { executarComandoFatura } from "@/lib/servicos/fatura-telegram";
import { executarComandoClientes } from "@/lib/servicos/clientes-telegram";
import { AJUDA_BOT } from "@/lib/dominio/telegram";

export const dynamic = "force-dynamic";

/**
 * Webhook do bot. Segurança em duas camadas: o secret que o próprio Telegram
 * ecoa num header a cada entrega, e o filtro do único chat autorizado —
 * updates de estranhos morrem com 200 silencioso (não vaza nada).
 */
export async function POST(request: Request) {
  const segredo = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!segredo || request.headers.get("x-telegram-bot-api-secret-token") !== segredo) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const update = await request.json().catch(() => null);
  const mensagem = update?.message;
  const chatId = String(mensagem?.chat?.id ?? "");
  const autorizado = process.env.TELEGRAM_CHAT_ID;

  if (!autorizado || chatId !== autorizado) {
    return NextResponse.json({ ok: true });
  }

  const texto = String(mensagem?.text ?? "").trim();
  if (texto.startsWith("/fatura")) {
    await enviarTelegram(await executarComandoFatura(texto));
  } else if (texto.startsWith("/clientes")) {
    for (const parte of await executarComandoClientes()) {
      await enviarTelegram(parte);
    }
  } else {
    await enviarTelegram(AJUDA_BOT);
  }

  return NextResponse.json({ ok: true });
}
