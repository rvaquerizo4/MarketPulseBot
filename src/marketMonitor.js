const { config } = require("./config");
const { sendTelegramMessage } = require("./telegram");
const { calculateRSI, rsiEmoji, rsiLabel } = require("./rsi");
const { appendToCsv } = require("./csvLogger");
const { fetchAllQuotes } = require("./api/quotes");
const {
  isFreshForAlerts,
  checkPriceTargets,
  checkMarketSchedule,
  getSignificantChanges,
  buildAlertMessage,
} = require("./alerts/engine");
const {
  formatPercent,
  formatPrice,
  formatVolume,
  escapeHtml,
  trendIcon,
  moveBar,
} = require("./utils/formatters");
const {
  recordEvent,
  buildEventFromAlert,
  buildEventFromMessage,
  formatRecentEvents,
} = require("./utils/eventHistory");

function getTodayLocalDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getISOWeekKey() {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function categoryHeader(category) {
  if (category === "Crypto") return "🪙 <b>Cryptocurrencies</b>";
  if (category === "ETF") return "📈 <b>ETFs</b>";
  if (category === "Stocks") return "🏢 <b>Stocks</b>";
  return "📊 <b>Index Funds</b>";
}

function average24hChange(quotes) {
  const valid = quotes.filter((q) => Number.isFinite(q.change24hPct));
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, q) => acc + q.change24hPct, 0);
  return sum / valid.length;
}

function updatePriceHistory(priceHistory, quotes, nowMs) {
  const nextHistory = { ...priceHistory };
  const minTs = nowMs - config.priceHistoryRetentionMs;

  for (const item of quotes) {
    const entries = Array.isArray(nextHistory[item.key]) ? [...nextHistory[item.key]] : [];
    entries.push({ ts: nowMs, price: item.price });
    nextHistory[item.key] = entries.filter(
      (entry) => Number.isFinite(entry.ts) && entry.ts >= minTs && Number.isFinite(entry.price)
    );
  }

  return nextHistory;
}

function groupByCategory(quotes) {
  const grouped = new Map();
  for (const quote of quotes) {
    if (!grouped.has(quote.category)) {
      grouped.set(quote.category, []);
    }
    grouped.get(quote.category).push(quote);
  }
  return grouped;
}

function buildDailyReport(quotes, yesterdaySnapshot = {}, priceHistory = {}, recentEvents = []) {
  const today = getTodayLocalDate();
  const grouped = groupByCategory(quotes);
  const rankingBase = quotes.filter((q) => isFreshForAlerts(q));
  const sortedByChange = [...rankingBase].sort((a, b) => {
    const av = Number.isFinite(a.change24hPct) ? a.change24hPct : -Infinity;
    const bv = Number.isFinite(b.change24hPct) ? b.change24hPct : -Infinity;
    return bv - av;
  });
  const topWinners = sortedByChange.slice(0, 3);
  const topLosers = [...sortedByChange]
    .sort((a, b) => {
      const av = Number.isFinite(a.change24hPct) ? a.change24hPct : Infinity;
      const bv = Number.isFinite(b.change24hPct) ? b.change24hPct : Infinity;
      return av - bv;
    })
    .slice(0, 3);

  const upCount = quotes.filter((q) => Number.isFinite(q.change24hPct) && q.change24hPct > 0.2).length;
  const downCount = quotes.filter((q) => Number.isFinite(q.change24hPct) && q.change24hPct < -0.2).length;
  const flatCount = Math.max(0, quotes.length - upCount - downCount);
  const avgChange = average24hChange(quotes);
  const sentimentEmoji =
    Number.isFinite(avgChange) && avgChange > 0.3
      ? "🟢"
      : Number.isFinite(avgChange) && avgChange < -0.3
        ? "🔴"
        : "🟡";

  const lines = [
    "<b>📅 Daily Market Dashboard</b>",
    `<b>Date:</b> ${today}`,
    "",
    "<b>🌍 Global Summary</b>",
    `${sentimentEmoji} Average 24h bias: <b>${escapeHtml(formatPercent(avgChange))}</b>`,
    `🟢 Up: <b>${upCount}</b>  |  🔴 Down: <b>${downCount}</b>  |  🟡 Flat: <b>${flatCount}</b>`,
    "",
    "<b>🏆 Top Gainers (24h)</b>",
    ...topWinners.map(
      (item, idx) =>
        `${idx + 1}. ${trendIcon(item.change24hPct)} <b>${escapeHtml(item.symbol)}</b> <i>${escapeHtml(item.name || item.symbol)}</i> ${escapeHtml(
          formatPercent(item.change24hPct)
        )}`
    ),
    "",
    "<b>⚠️ Top Losers (24h)</b>",
    ...topLosers.map(
      (item, idx) =>
        `${idx + 1}. ${trendIcon(item.change24hPct)} <b>${escapeHtml(item.symbol)}</b> <i>${escapeHtml(item.name || item.symbol)}</i> ${escapeHtml(
          formatPercent(item.change24hPct)
        )}`
    ),
    "",
  ];

  for (const [category, items] of grouped.entries()) {
    lines.push(categoryHeader(category));
    for (const item of items) {
      const symbol = escapeHtml(item.symbol);
      const name = escapeHtml(item.name || item.symbol);
      const price = escapeHtml(formatPrice(item.price, item.currency));
      const change24h = escapeHtml(formatPercent(item.change24hPct));
      const volume = escapeHtml(formatVolume(item.volume));

      // Comparison vs yesterday
      const yday = yesterdaySnapshot[item.key];
      const ydayStr =
        yday && Number.isFinite(yday.price) && yday.price > 0
          ? `  vs yesterday: <b>${escapeHtml(formatPercent(((item.price - yday.price) / yday.price) * 100))}</b>`
          : "";

      // RSI-14
      const rsi = calculateRSI(priceHistory[item.key]);
      const rsiStr =
        rsi !== null
          ? `\nRSI(14): <b>${rsi}</b> ${rsiEmoji(rsi)} <i>${rsiLabel(rsi)}</i>`
          : "";
      const freshnessStr =
        item.category !== "Crypto" && item.isStale
          ? `\n⚠️ Data age: <b>${escapeHtml(String(item.ageMinutes ?? "N/D"))} min</b> (outside freshness window)`
          : "";

      lines.push(
        `${trendIcon(item.change24hPct)} <b>${symbol}</b> <i>${name}</i>  ${price}\n` +
          `24h: <b>${change24h}</b>${ydayStr}  ${moveBar(item.change24hPct)}\n` +
          `Volume: ${volume}${rsiStr}${freshnessStr}`
      );
      lines.push("");
    }
  }

  if (quotes.length === 0) {
    lines.push("⚠️ Could not fetch quotes at this time.");
  }

  if (config.dailyReportRecentEventsLimit > 0) {
    lines.push("");
    lines.push("<b>🕘 Recent Events</b>");
    lines.push(formatRecentEvents(recentEvents, config.dailyReportRecentEventsLimit));
  }

  lines.push("<i>Automated background monitoring is active</i>");

  return lines.join("\n");
}

// ─────────────────────────────────────────────
// Weekly report
// ─────────────────────────────────────────────

function buildWeeklyReport(quotes, weeklyStartSnapshot = {}) {
  const today = getTodayLocalDate();
  const withWeekly = quotes.map((item) => {
    const prev = weeklyStartSnapshot[item.key];
    const weeklyChangePct =
      prev && Number.isFinite(prev.price) && prev.price > 0
        ? ((item.price - prev.price) / prev.price) * 100
        : null;
    return { ...item, weeklyChangePct };
  });

  const validWeekly = withWeekly.filter((i) => Number.isFinite(i.weeklyChangePct));
  const sorted = [...validWeekly].sort((a, b) => b.weeklyChangePct - a.weeklyChangePct);
  const avgWeekly =
    validWeekly.length > 0
      ? validWeekly.reduce((acc, i) => acc + i.weeklyChangePct, 0) / validWeekly.length
      : null;
  const sentimentEmoji =
    Number.isFinite(avgWeekly) && avgWeekly > 0.3 ? "🟢" :
    Number.isFinite(avgWeekly) && avgWeekly < -0.3 ? "🔴" : "🟡";

  const lines = [
    "<b>📊 Weekly Market Summary</b>",
    `<b>Date:</b> ${today}`,
    "",
    "<b>🌍 Weekly balance</b>",
    `${sentimentEmoji} Average weekly bias: <b>${escapeHtml(formatPercent(avgWeekly))}</b>`,
    "",
  ];

  if (sorted.length > 0) {
    lines.push("<b>🏆 Best performers this week</b>");
    sorted.slice(0, 3).forEach((item, idx) => {
      lines.push(
        `${idx + 1}. ${trendIcon(item.weeklyChangePct)} <b>${escapeHtml(item.symbol)}</b> <i>${escapeHtml(item.name || item.symbol)}</i> ${escapeHtml(formatPercent(item.weeklyChangePct))}`
      );
    });
    lines.push("");
    lines.push("<b>⚠️ Worst performers this week</b>");
    [...sorted].reverse().slice(0, 3).forEach((item, idx) => {
      lines.push(
        `${idx + 1}. ${trendIcon(item.weeklyChangePct)} <b>${escapeHtml(item.symbol)}</b> <i>${escapeHtml(item.name || item.symbol)}</i> ${escapeHtml(formatPercent(item.weeklyChangePct))}`
      );
    });
    lines.push("");
  }

  lines.push("<b>📋 Weekly detail</b>");
  for (const item of withWeekly) {
    const weekly = Number.isFinite(item.weeklyChangePct)
      ? escapeHtml(formatPercent(item.weeklyChangePct))
      : "N/D";
    lines.push(
      `${trendIcon(item.weeklyChangePct ?? item.change24hPct)} <b>${escapeHtml(item.symbol)}</b> <i>${escapeHtml(item.name || item.symbol)}</i>\n` +
        `${escapeHtml(formatPrice(item.price, item.currency))} | Week: <b>${weekly}</b> | 24h: ${escapeHtml(formatPercent(item.change24hPct))}`
    );
    lines.push("");
  }

  return lines.join("\n");
}

function buildSnapshot(quotes) {
  const snapshot = {};
  for (const item of quotes) {
    snapshot[item.key] = {
      symbol: item.symbol,
      category: item.category,
      price: item.price,
      name: item.name || item.symbol,
      currency: item.currency,
      change24hPct: item.change24hPct,
      volume: item.volume,
      marketState: item.marketState,
      lastTradeAt: item.lastTradeAt,
      ageMinutes: item.ageMinutes,
      isStale: item.isStale,
      checkedAt: new Date().toISOString(),
    };
  }
  return snapshot;
}

async function runCycle(state, options = { isStartup: false }) {
  const nowMs = Date.now();
  const quotes = await fetchAllQuotes();
  const freshQuotes = quotes.filter((q) => isFreshForAlerts(q));
  const today = getTodayLocalDate();
  const weekKey = getISOWeekKey();
  const isMonday = new Date().getDay() === 1;

  // Archive previous day snapshot when a new day starts
  if (state.lastDailyReportDate !== today) {
    state.yesterdaySnapshot = { ...state.previousSnapshot };
  }

  // Daily report (first startup of the day)
  if (options.isStartup && state.lastDailyReportDate !== today) {
    const reportText = buildDailyReport(
      quotes,
      state.yesterdaySnapshot,
      state.priceHistory || {},
      state.recentEvents || []
    );
    await sendTelegramMessage(reportText, { parseMode: "HTML" });
    state.lastDailyReportDate = today;
  }

  // Weekly report (Monday, first startup of the week)
  if (options.isStartup && isMonday && state.lastWeeklyReportDate !== weekKey) {
    const weeklyText = buildWeeklyReport(freshQuotes, state.weeklyStartSnapshot || {});
    await sendTelegramMessage(weeklyText, { parseMode: "HTML" });
    state.lastWeeklyReportDate = weekKey;
    state.weeklyStartSnapshot = buildSnapshot(freshQuotes);
  }

  // Update price history
  const updatedPriceHistory = updatePriceHistory(state.priceHistory || {}, quotes, nowMs);

  // Market schedule alerts
  const scheduleAlerts = checkMarketSchedule(state, freshQuotes, nowMs, getTodayLocalDate);
  for (const text of scheduleAlerts) {
    await sendTelegramMessage(text, { parseMode: "HTML" });
    recordEvent(
      state,
      buildEventFromMessage("schedule", text.replace(/<[^>]+>/g, ""), "info"),
      config.recentEventsLimit
    );
  }

  // Price target alerts
  const { alerts: targetAlerts, updatedLastAlertAt: updatedTargetAt } = checkPriceTargets(
    freshQuotes,
    state.lastPriceTargetAlertAt || {},
    nowMs
  );
  for (const text of targetAlerts) {
    await sendTelegramMessage(text, { parseMode: "HTML" });
    recordEvent(
      state,
      buildEventFromMessage("target", text.replace(/<[^>]+>/g, ""), "warning"),
      config.recentEventsLimit
    );
  }

  // Significant move alerts
  const { alerts, updatedLastAlertAt } = getSignificantChanges(
    freshQuotes,
    state.previousSnapshot || {},
    state.lastAlertAt || {},
    updatedPriceHistory
  );
  for (const alert of alerts) {
    await sendTelegramMessage(buildAlertMessage(alert), { parseMode: "HTML" });
    recordEvent(state, buildEventFromAlert(alert), config.recentEventsLimit);
  }

  // Historical CSV log
  await appendToCsv(quotes);

  // Update state
  state.previousSnapshot = buildSnapshot(quotes);
  state.lastAlertAt = updatedLastAlertAt;
  state.priceHistory = updatedPriceHistory;
  state.lastPriceTargetAlertAt = updatedTargetAt;
  state.lastCheckAt = new Date(nowMs).toISOString();

  return {
    quotesCount: quotes.length,
    alertsCount: alerts.length + targetAlerts.length + scheduleAlerts.length,
    dailyReportSent: options.isStartup && state.lastDailyReportDate === today,
  };
}

module.exports = { runCycle, buildDailyReport, fetchAllQuotes };
