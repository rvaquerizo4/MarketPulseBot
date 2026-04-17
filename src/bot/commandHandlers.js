const { config } = require("../config");
const { sendTelegramMessage } = require("../telegram");
const { fetchYahooQuotes } = require("../providers/yahoo");
const { formatPrice, formatPercent, escapeHtml } = require("../utils/formatters");
const { formatRecentEvents } = require("../utils/eventHistory");
const {
  getEditableSettings,
  getEditableSettingKeys,
  setEditableSetting,
  resetEditableSetting,
} = require("../runtimeConfig");

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
        state.priceHistory || {},
        state.recentEvents || []
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
        `Last weekly report: <b>${escapeHtml(state.lastWeeklyReportDate || "Never")}</b>\n` +
        `Stored recent events: <b>${escapeHtml(String((state.recentEvents || []).length))}</b>`,
      { parseMode: "HTML" }
    );
    return;
  }

  if (command === "/historial" || command === "/events") {
    await sendTelegramMessage(
      `<b>🕘 Recent Events</b>\n\n${formatRecentEvents(state.recentEvents || [], 10)}`,
      { parseMode: "HTML" }
    );
    return;
  }

  if (command === "/config") {
    const settings = getEditableSettings();
    const top = settings
      .slice(0, 14)
      .map(
        (item) =>
          `• <b>${escapeHtml(item.key)}</b> = <code>${escapeHtml(item.value || "")}</code>${
            item.overridden ? " <i>(runtime)</i>" : ""
          }`
      )
      .join("\n");
    await sendTelegramMessage(
      `<b>⚙️ Runtime Config</b>\n\n` +
        `${top}\n\n` +
        `<i>Usa /set KEY VALUE para cambiar y /unset KEY para restaurar desde .env.</i>`,
      { parseMode: "HTML" }
    );
    return;
  }

  if (command === "/set") {
    const match = text.match(/^\/set(?:@\w+)?\s+(\S+)\s+([\s\S]+)$/i);
    if (!match) {
      await sendTelegramMessage(
        `Uso: <b>/set KEY VALUE</b>\nEjemplo: <code>/set ETF_WARNING_THRESHOLD_PERCENT 0.8</code>`,
        { parseMode: "HTML" }
      );
      return;
    }

    const envKey = String(match[1] || "").toUpperCase();
    const rawValue = String(match[2] || "").trim();

    try {
      const updated = await setEditableSetting(envKey, rawValue);
      await sendTelegramMessage(
        `✅ <b>${escapeHtml(updated.key)}</b> actualizado a <code>${escapeHtml(
          updated.value
        )}</code>\n<i>Cambio aplicado en runtime y persistido.</i>`,
        { parseMode: "HTML" }
      );
    } catch (error) {
      const validKeys = getEditableSettingKeys().slice(0, 18).join(", ");
      await sendTelegramMessage(
        `⚠️ No se pudo actualizar: ${escapeHtml(error.message)}\n\n` +
          `<b>Claves soportadas (resumen):</b>\n<code>${escapeHtml(validKeys)}</code>`,
        { parseMode: "HTML" }
      );
    }
    return;
  }

  if (command === "/unset") {
    if (!arg) {
      await sendTelegramMessage(
        `Uso: <b>/unset KEY</b>\nEjemplo: <code>/unset ETF_WARNING_THRESHOLD_PERCENT</code>`,
        { parseMode: "HTML" }
      );
      return;
    }

    const envKey = String(arg || "").toUpperCase();
    try {
      const updated = await resetEditableSetting(envKey);
      await sendTelegramMessage(
        `↩️ <b>${escapeHtml(updated.key)}</b> restaurado a <code>${escapeHtml(
          updated.value
        )}</code> desde .env`,
        { parseMode: "HTML" }
      );
    } catch (error) {
      await sendTelegramMessage(`⚠️ ${escapeHtml(error.message)}`, { parseMode: "HTML" });
    }
    return;
  }

  if (command === "/ayuda" || command === "/help") {
    await sendTelegramMessage(
      `<b>🤖 Market Watcher — Commands</b>\n\n` +
        `/report — Full dashboard right now\n` +
        `/price SYMBOL — Current price for an asset\n` +
        `/status — Bot status and last check\n` +
        `/events — Recent alert and schedule history\n` +
      `/config — Show current runtime config\n` +
      `/set KEY VALUE — Update runtime config\n` +
      `/unset KEY — Restore value from .env\n` +
        `/help — This help\n\n` +
        `<i>Examples: /price BTC  /price GLD  /price AAPL</i>`,
      { parseMode: "HTML" }
    );
  }
}

module.exports = { handleCommand };
