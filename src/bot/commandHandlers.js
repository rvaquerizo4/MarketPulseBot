const { config } = require("../config");
const { sendTelegramMessage } = require("../telegram");
const { fetchYahooQuotes } = require("../providers/yahoo");
const { formatPrice, formatPercent, escapeHtml } = require("../utils/formatters");

async function handleCommand(text, state, handlers) {
  const parts = text.trim().split(/\s+/);
  const command = (parts[0] || "").toLowerCase().split("@")[0];
  const arg = parts[1] || "";

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
      await sendTelegramMessage(`⚠️ Error generating report: ${escapeHtml(e.message)}`);
    }
    return;
  }

  if (command === "/precio" || command === "/price") {
    if (!arg) {
      await sendTelegramMessage(
        "Usage: <b>/price SYMBOL</b>\nExamples: /price GLD  /price AAPL  /price BTC",
        { parseMode: "HTML" }
      );
      return;
    }

    const symbolUpper = arg.toUpperCase();
    const cached = Object.values(state.previousSnapshot || {}).find(
      (s) => s.symbol === symbolUpper
    );

    if (cached) {
      const name =
        cached.name && cached.name !== cached.symbol
          ? ` — <i>${escapeHtml(cached.name)}</i>`
          : "";
      const checkedAt = new Date(cached.checkedAt).toLocaleString("es-ES");
      const staleWarn =
        cached.isStale
          ? `\n⚠️ <i>Dato no fresco (${escapeHtml(String(cached.ageMinutes ?? "N/D"))} min desde última actualización de mercado).</i>`
          : "";
      await sendTelegramMessage(
        `<b>${escapeHtml(cached.symbol)}</b>${name}\n` +
          `Price: <b>${escapeHtml(formatPrice(cached.price, cached.currency))}</b>\n` +
          `24h: <b>${escapeHtml(formatPercent(cached.change24hPct))}</b>\n` +
          `<i>Last check data: ${escapeHtml(checkedAt)}</i>${staleWarn}`,
        { parseMode: "HTML" }
      );
      return;
    }

    try {
      const results = await fetchYahooQuotes([arg], "Query");
      const found = results[0];
      if (found) {
        const name =
          found.name && found.name !== found.symbol
            ? ` — <i>${escapeHtml(found.name)}</i>`
            : "";
        await sendTelegramMessage(
          `<b>${escapeHtml(found.symbol)}</b>${name}\n` +
            `Price: <b>${escapeHtml(formatPrice(found.price, found.currency))}</b>\n` +
            `24h: <b>${escapeHtml(formatPercent(found.change24hPct))}</b>`,
          { parseMode: "HTML" }
        );
      } else {
        await sendTelegramMessage(
          `No quote was found for <b>${escapeHtml(symbolUpper)}</b>.\n` +
            `Check that the ticker is correct (e.g. GLD, AAPL, BRK-B).`,
          { parseMode: "HTML" }
        );
      }
    } catch (e) {
      await sendTelegramMessage(`⚠️ Error fetching price: ${escapeHtml(e.message)}`);
    }
    return;
  }

  if (command === "/estado" || command === "/status") {
    const lastCheck = state.lastCheckAt
      ? new Date(state.lastCheckAt).toLocaleString("es-ES")
      : "Never";
    const assets = Object.keys(state.previousSnapshot || {}).length;
    const intervalMin = Math.round(config.checkIntervalMs / 60000);
    await sendTelegramMessage(
      `<b>✅ Market Watcher — Status</b>\n\n` +
        `Last check: <b>${escapeHtml(lastCheck)}</b>\n` +
        `Monitored assets: <b>${assets}</b>\n` +
        `Check interval: <b>${intervalMin} min</b>\n\n` +
        `Last daily report: <b>${escapeHtml(state.lastDailyReportDate || "Never")}</b>\n` +
        `Last weekly report: <b>${escapeHtml(state.lastWeeklyReportDate || "Never")}</b>`,
      { parseMode: "HTML" }
    );
    return;
  }

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
  }
}

module.exports = { handleCommand };
