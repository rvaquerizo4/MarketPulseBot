const { config } = require("./config");
const { saveState } = require("./stateStore");
const { handleCommand } = require("./bot/commandHandlers");

async function getUpdates(lastUpdateId) {
  const url = new URL(
    `https://api.telegram.org/bot${config.telegramBotToken}/getUpdates`
  );
  url.searchParams.set("offset", String(lastUpdateId + 1));
  url.searchParams.set("timeout", String(config.telegramLongPollingTimeoutSeconds));
  url.searchParams.set("limit", String(config.telegramUpdatesLimit));

  const controller = new AbortController();
  const effectiveTimeoutMs = Math.max(
    config.requestTimeoutMs,
    (config.telegramLongPollingTimeoutSeconds + config.telegramLongPollingGraceSeconds) * 1000
  );
  const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { updates: [], nextOffset: lastUpdateId };
    const data = await res.json();
    const updates = data.result || [];
    const nextOffset =
      updates.length > 0 ? updates[updates.length - 1].update_id : lastUpdateId;
    return { updates, nextOffset };
  } catch {
    return { updates: [], nextOffset: lastUpdateId };
  } finally {
    clearTimeout(timeout);
  }
}

async function pollAndHandle(state, handlers) {
  try {
    const { updates, nextOffset } = await getUpdates(state.lastUpdateId || 0);
    if (nextOffset !== state.lastUpdateId) {
      state.lastUpdateId = nextOffset;
      try {
        await saveState(state);
      } catch {
        // Offset persistence errors are non-critical; next cycle save may still persist it.
      }
    }

    for (const update of updates) {
      const msg = update.message || update.edited_message;
      if (!msg || !msg.text) continue;
      // Only respond to the authorized chat (avoid third-party interactions)
      if (String(msg.chat.id) !== String(config.telegramChatId)) continue;
      if (!msg.text.startsWith("/")) continue;

      await handleCommand(msg.text, state, handlers);
    }
  } catch {
    // Polling errors are non-critical
  }
}

module.exports = { pollAndHandle };
