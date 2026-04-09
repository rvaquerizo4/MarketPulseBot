const { config } = require("./config");

async function sendTelegramMessage(text, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: config.telegramChatId,
          text,
          parse_mode: options.parseMode,
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram API error (${response.status}): ${body}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  sendTelegramMessage,
};
