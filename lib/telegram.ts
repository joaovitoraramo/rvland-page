import "server-only";

/**
 * Envio de mensagem ao chat autorizado do bot. Nunca lança: aviso é
 * cortesia — a operação que avisa não pode morrer porque o Telegram falhou.
 * Sem envs configuradas (dev sem bot), vira no-op.
 */
export async function enviarTelegram(texto: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  try {
    const resposta = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resposta.ok) console.error("[telegram] sendMessage falhou:", resposta.status);
    return resposta.ok;
  } catch (err) {
    console.error("[telegram] falha ao enviar:", err);
    return false;
  }
}
