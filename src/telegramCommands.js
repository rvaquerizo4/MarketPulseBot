const { config } = require("./config");
const { sendTelegramMessage } = require("./telegram");
const { fetchYahooQuotes } = require("./providers/yahoo");

async function getUpdates(lastUpdateId) {
  const url = new URL(
    `https://api.telegram.org/bot${config.telegramBotToken}/getUpdates`
  );
  url.searchParams.set("offset", String(lastUpdateId + 1));
  url.searchParams.set("timeout", "0");
  url.searchParams.set("limit", "10");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

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

function fmtPrice(value, currency = "USD") {
  if (!Number.isFinite(value)) return "N/D";
  const digits = value < 1 ? 6 : 2;
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${currency}`;
  }
}

function fmtPct(value) {
  if (!Number.isFinite(value)) return "N/D";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function handleCommand(text, state, handlers) {
  const parts = text.trim().split(/\s+/);
  const command = (parts[0] || "").toLowerCase().split("@")[0];
  const arg = parts[1] || "";

  // /report — full dashboard right now
  if (command === "/reporte" || command === "/report") {
    try {
      const quotes = await handlers.fetchAllQuotes();
      const report = handlers.buildDailyReport(
        quotes,
        state.yesterdaySnapshot || {},
        state.priceHistory || {}
      );
      await sendTelegramMessage(report, { parseMode: "HTML" });
    } catch (e) {
      await sendTelegramMessage(`⚠️ Error generating report: ${esc(e.message)}`);
    }
    return;
  }

  // /price SYMBOL — live price
  if (command === "/precio" || command === "/price") {
    if (!arg) {
      await sendTelegramMessage(
        "Usage: <b>/price SYMBOL</b>\nExamples: /price GLD  /price AAPL  /price BTC",
        { parseMode: "HTML" }
      );
      return;
    }

    const symbolUpper = arg.toUpperCase();

    // Check current snapshot (latest monitored data)
    const cached = Object.values(state.previousSnapshot || {}).find(
      (s) => s.symbol === symbolUpper
    );

    if (cached) {
      const name =
        cached.name && cached.name !== cached.symbol
          ? ` — <i>${esc(cached.name)}</i>`
          : "";
      const checkedAt = new Date(cached.checkedAt).toLocaleString("es-ES");
      await sendTelegramMessage(
        `<b>${esc(cached.symbol)}</b>${name}\n` +
          `Price: <b>${esc(fmtPrice(cached.price, cached.currency))}</b>\n` +
          `24h: <b>${esc(fmtPct(cached.change24hPct))}</b>\n` +
          `<i>Last check data: ${esc(checkedAt)}</i>`,
        { parseMode: "HTML" }
      );
      return;
    }

    // Live fetch from Yahoo for symbols not in current watchlist
    try {
      const results = await fetchYahooQuotes([arg], "Query");
      const found = results[0];
      if (found) {
        const name =
          found.name && found.name !== found.symbol
            ? ` — <i>${esc(found.name)}</i>`
            : "";
        await sendTelegramMessage(
          `<b>${esc(found.symbol)}</b>${name}\n` +
            `Price: <b>${esc(fmtPrice(found.price, found.currency))}</b>\n` +
            `24h: <b>${esc(fmtPct(found.change24hPct))}</b>`,
          { parseMode: "HTML" }
        );
      } else {
        await sendTelegramMessage(
          `No quote was found for <b>${esc(symbolUpper)}</b>.\n` +
            `Check that the ticker is correct (e.g. GLD, AAPL, BRK-B).`,
          { parseMode: "HTML" }
        );
      }
    } catch (e) {
      await sendTelegramMessage(`⚠️ Error fetching price: ${esc(e.message)}`);
    }
    return;
  }

  // /status — bot status
  if (command === "/estado" || command === "/status") {
    const lastCheck = state.lastCheckAt
      ? new Date(state.lastCheckAt).toLocaleString("es-ES")
      : "Never";
    const assets = Object.keys(state.previousSnapshot || {}).length;
    const intervalMin = Math.round(config.checkIntervalMs / 60000);
    await sendTelegramMessage(
      `<b>✅ Market Watcher — Status</b>\n\n` +
        `Last check: <b>${esc(lastCheck)}</b>\n` +
        `Monitored assets: <b>${assets}</b>\n` +
        `Check interval: <b>${intervalMin} min</b>\n\n` +
        `Last daily report: <b>${esc(state.lastDailyReportDate || "Never")}</b>\n` +
        `Last weekly report: <b>${esc(state.lastWeeklyReportDate || "Never")}</b>`,
      { parseMode: "HTML" }
    );
    return;
  }

  // /help
  if (command === "/ayuda" || command === "/help") {
    await sendTelegramMessage(
      `<b>🤖 Market Watcher — Commands</b>\n\n` +
        `/report — Full dashboard right now\n` +
        `/price SYMBOL — Current price for an asset\n` +
        `/status — Bot status and last check\n` +
        `/help — This help\n\n` +
        `<i>Examples: /price BTC  /price GLD  /price AAPL</i>`,
      { parseMode: "HTML" }
    );
    return;
  }
}

async function pollAndHandle(state, handlers) {
  try {
    const { updates, nextOffset } = await getUpdates(state.lastUpdateId || 0);
    if (nextOffset !== state.lastUpdateId) {
      state.lastUpdateId = nextOffset;
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
