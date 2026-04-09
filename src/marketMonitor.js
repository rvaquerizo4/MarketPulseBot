const { config } = require("./config");
const { sendTelegramMessage } = require("./telegram");
const { fetchCryptoQuotes } = require("./providers/coingecko");
const { fetchYahooQuotes } = require("./providers/yahoo");
const { calculateRSI, rsiEmoji, rsiLabel } = require("./rsi");
const { appendToCsv } = require("./csvLogger");

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

function formatPercent(value) {
  if (!Number.isFinite(value)) return "N/D";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatPrice(value, currency = "USD") {
  if (!Number.isFinite(value)) return "N/D";

  const fractionDigits = value < 1 ? 6 : 2;
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    return `${value.toFixed(fractionDigits)} ${currency}`;
  }
}

function formatVolume(value) {
  if (!Number.isFinite(value) || value <= 0) return "N/D";
  return new Intl.NumberFormat("es-ES", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function trendIcon(change24hPct) {
  if (!Number.isFinite(change24hPct)) return "⚪";
  if (change24hPct >= 1) return "🟢";
  if (change24hPct <= -1) return "🔴";
  return "🟡";
}

function moveBar(change24hPct) {
  if (!Number.isFinite(change24hPct)) return "▫▫▫▫▫";
  const blocks = Math.min(5, Math.max(1, Math.round(Math.abs(change24hPct) / 1.5)));
  const active = change24hPct >= 0 ? "🟩" : "🟥";
  return active.repeat(blocks) + "⬜".repeat(5 - blocks);
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

function getCategoryType(category) {
  if (category === "Crypto") return "crypto";
  if (category === "ETF") return "etf";
  if (category === "Stocks") return "stock";
  return "index";
}

function getAlertLevel(absDeltaPct, categoryType) {
  const thresholds = config.thresholds[categoryType];
  if (absDeltaPct >= thresholds.critical) {
    return { key: "critical", label: "Critical", emoji: "🔴" };
  }
  if (absDeltaPct >= thresholds.strong) {
    return { key: "strong", label: "Strong", emoji: "🟠" };
  }
  return { key: "warning", label: "Warning", emoji: "🟡" };
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

function calculateAccumulatedChangePct(entries, currentPrice, nowMs) {
  if (!Array.isArray(entries) || entries.length === 0 || !Number.isFinite(currentPrice)) {
    return null;
  }

  const targetTs = nowMs - config.accumulatedChangeWindowMs;
  let reference = null;

  for (const entry of entries) {
    if (!Number.isFinite(entry.ts) || !Number.isFinite(entry.price)) continue;
    if (entry.ts <= targetTs) {
      if (!reference || entry.ts > reference.ts) {
        reference = entry;
      }
    }
  }

  if (!reference || reference.price === 0) {
    return null;
  }

  return ((currentPrice - reference.price) / reference.price) * 100;
}

async function fetchAllQuotes() {
  const settled = await Promise.allSettled([
    fetchCryptoQuotes(config.cryptoIds),
    fetchYahooQuotes(config.etfSymbols, "ETF"),
    fetchYahooQuotes(config.indexFundSymbols, "Index Fund"),
    fetchYahooQuotes(config.stockSymbols, "Stocks"),
  ]);

  const quotes = settled
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  if (quotes.length === 0) {
    throw new Error("Could not fetch quotes from any provider");
  }

  return quotes;
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

function buildDailyReport(quotes, yesterdaySnapshot = {}, priceHistory = {}) {
  const today = getTodayLocalDate();
  const grouped = groupByCategory(quotes);
  const sortedByChange = [...quotes].sort((a, b) => {
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

      lines.push(
        `${trendIcon(item.change24hPct)} <b>${symbol}</b> <i>${name}</i>  ${price}\n` +
          `24h: <b>${change24h}</b>${ydayStr}  ${moveBar(item.change24hPct)}\n` +
          `Volume: ${volume}${rsiStr}`
      );
      lines.push("");
    }
  }

  if (quotes.length === 0) {
    lines.push("⚠️ Could not fetch quotes at this time.");
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

// ─────────────────────────────────────────────
// Price target alerts
// ─────────────────────────────────────────────

function checkPriceTargets(quotes, lastPriceTargetAlertAt, nowMs) {
  if (!config.priceTargets || config.priceTargets.length === 0) {
    return { alerts: [], updatedLastAlertAt: lastPriceTargetAlertAt };
  }
  const alerts = [];
  const updatedLastAlertAt = { ...lastPriceTargetAlertAt };

  for (const target of config.priceTargets) {
    const item = quotes.find((q) => q.symbol === target.symbol);
    if (!item || !Number.isFinite(item.price)) continue;

    const triggered =
      target.direction === "ABOVE" ? item.price > target.threshold : item.price < target.threshold;
    if (!triggered) continue;

    const cooldownKey = `${item.key}:${target.direction}:${target.threshold}`;
    const lastMs = updatedLastAlertAt[cooldownKey]
      ? Date.parse(updatedLastAlertAt[cooldownKey])
      : 0;
    if (Number.isFinite(lastMs) && nowMs - lastMs < config.alertCooldownMs) continue;

    updatedLastAlertAt[cooldownKey] = new Date(nowMs).toISOString();
    const dir = target.direction === "ABOVE" ? "went above" : "fell below";
    alerts.push(
      `🎯 <b>Price target reached</b>\n` +
        `<b>${escapeHtml(item.symbol)}</b> ${dir} ${escapeHtml(formatPrice(target.threshold, item.currency))}\n` +
        `Current price: <b>${escapeHtml(formatPrice(item.price, item.currency))}</b>`
    );
  }

  return { alerts, updatedLastAlertAt };
}

// ─────────────────────────────────────────────
// Market open/close alerts
// ─────────────────────────────────────────────

function isTimeInWindow(h, m, targetH, targetM, windowMin) {
  const current = h * 60 + m;
  const target = targetH * 60 + targetM;
  return current >= target && current < target + windowMin;
}

function checkMarketSchedule(state, quotes, nowMs) {
  const now = new Date(nowMs);
  const h = now.getHours();
  const m = now.getMinutes();
  const today = getTodayLocalDate();
  const windowMin = Math.ceil(config.checkIntervalMs / 60000);
  const alerts = [];

  if (
    isTimeInWindow(h, m, config.marketOpenHour, config.marketOpenMinute, windowMin) &&
    state.lastMarketOpenAlertDate !== today
  ) {
    state.lastMarketOpenAlertDate = today;
    const avg = average24hChange(quotes);
    const emoji = Number.isFinite(avg) && avg > 0 ? "🟢" : Number.isFinite(avg) && avg < 0 ? "🔴" : "🟡";
    alerts.push(
      `🔔 <b>Market open</b>\n` +
        `${emoji} Average 24h bias: <b>${escapeHtml(formatPercent(avg))}</b>\n` +
        `Monitoring every ${windowMin} minutes.`
    );
  }

  if (
    isTimeInWindow(h, m, config.marketCloseHour, config.marketCloseMinute, windowMin) &&
    state.lastMarketCloseAlertDate !== today
  ) {
    state.lastMarketCloseAlertDate = today;
    const sorted = [...quotes]
      .filter((q) => Number.isFinite(q.change24hPct))
      .sort((a, b) => b.change24hPct - a.change24hPct);
    const top = sorted[0];
    const bot = sorted[sorted.length - 1];
    let detail = "";
    if (top) detail += `\nBest of the day: <b>${escapeHtml(top.symbol)}</b> ${escapeHtml(formatPercent(top.change24hPct))}`;
    if (bot && bot !== top) detail += `\nWorst of the day: <b>${escapeHtml(bot.symbol)}</b> ${escapeHtml(formatPercent(bot.change24hPct))}`;
    alerts.push(`🔕 <b>Market close</b>${detail}`);
  }

  return alerts;
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
      checkedAt: new Date().toISOString(),
    };
  }
  return snapshot;
}

function getSignificantChanges(quotes, previousSnapshot, lastAlertAt, priceHistory) {
  const alerts = [];
  const updatedLastAlertAt = { ...lastAlertAt };
  const nowMs = Date.now();

  for (const item of quotes) {
    const prev = previousSnapshot[item.key];
    if (!prev || !Number.isFinite(prev.price) || prev.price === 0) continue;

    const deltaPct = ((item.price - prev.price) / prev.price) * 100;
    const absDeltaPct = Math.abs(deltaPct);
    const categoryType = getCategoryType(item.category);
    const warningThreshold = config.thresholds[categoryType].warning;
    if (absDeltaPct < warningThreshold) continue;

    const lastAlertMs = updatedLastAlertAt[item.key]
      ? Date.parse(updatedLastAlertAt[item.key])
      : 0;

    if (Number.isFinite(lastAlertMs) && nowMs - lastAlertMs < config.alertCooldownMs) {
      continue;
    }

    updatedLastAlertAt[item.key] = new Date(nowMs).toISOString();

    const accumulatedChangePct = calculateAccumulatedChangePct(
      priceHistory[item.key],
      item.price,
      nowMs
    );

    const level = getAlertLevel(absDeltaPct, categoryType);

    alerts.push({
      symbol: item.symbol,
      category: item.category,
      currentPrice: item.price,
      previousPrice: prev.price,
      name: item.name || item.symbol,
      currency: item.currency,
      deltaPct,
      change24hPct: item.change24hPct,
      accumulatedChangePct,
      volume: item.volume,
      level,
    });
  }

  return {
    alerts,
    updatedLastAlertAt,
  };
}

function buildAlertMessage(alert) {
  const direction = alert.deltaPct >= 0 ? "went up" : "went down";
  const absDelta = Math.abs(alert.deltaPct);
  const displayName =
    alert.name && alert.name !== alert.symbol
      ? `<b>${escapeHtml(alert.symbol)}</b> <i>${escapeHtml(alert.name)}</i>`
      : `<b>${escapeHtml(alert.symbol)}</b>`;

  const lines = [
    `${alert.level.emoji} <b>${escapeHtml(alert.level.label)}</b> — ${escapeHtml(alert.category)}`,
    `${displayName} ${direction} <b>${absDelta.toFixed(2)}%</b> since the last check`,
    `Before: ${escapeHtml(formatPrice(alert.previousPrice, alert.currency))} → Now: <b>${escapeHtml(formatPrice(alert.currentPrice, alert.currency))}</b>`,
    `24h: <b>${escapeHtml(formatPercent(alert.change24hPct))}</b>  |  Vol: ${escapeHtml(formatVolume(alert.volume))}`,
  ];

  if (Number.isFinite(alert.accumulatedChangePct)) {
    lines.push(
      `Accumulated ${Math.round(config.accumulatedChangeWindowMs / 60000)}min: <b>${escapeHtml(formatPercent(alert.accumulatedChangePct))}</b>`
    );
  }

  return lines.join("\n");
}

async function runCycle(state, options = { isStartup: false }) {
  const nowMs = Date.now();
  const quotes = await fetchAllQuotes();
  const today = getTodayLocalDate();
  const weekKey = getISOWeekKey();
  const isMonday = new Date().getDay() === 1;

  // Archive previous day snapshot when a new day starts
  if (state.lastDailyReportDate !== today) {
    state.yesterdaySnapshot = { ...state.previousSnapshot };
  }

  // Daily report (first startup of the day)
  if (options.isStartup && state.lastDailyReportDate !== today) {
    const reportText = buildDailyReport(quotes, state.yesterdaySnapshot, state.priceHistory || {});
    await sendTelegramMessage(reportText, { parseMode: "HTML" });
    state.lastDailyReportDate = today;
  }

  // Weekly report (Monday, first startup of the week)
  if (options.isStartup && isMonday && state.lastWeeklyReportDate !== weekKey) {
    const weeklyText = buildWeeklyReport(quotes, state.weeklyStartSnapshot || {});
    await sendTelegramMessage(weeklyText, { parseMode: "HTML" });
    state.lastWeeklyReportDate = weekKey;
    state.weeklyStartSnapshot = buildSnapshot(quotes);
  }

  // Update price history
  const updatedPriceHistory = updatePriceHistory(state.priceHistory || {}, quotes, nowMs);

  // Market schedule alerts
  const scheduleAlerts = checkMarketSchedule(state, quotes, nowMs);
  for (const text of scheduleAlerts) {
    await sendTelegramMessage(text, { parseMode: "HTML" });
  }

  // Price target alerts
  const { alerts: targetAlerts, updatedLastAlertAt: updatedTargetAt } = checkPriceTargets(
    quotes,
    state.lastPriceTargetAlertAt || {},
    nowMs
  );
  for (const text of targetAlerts) {
    await sendTelegramMessage(text, { parseMode: "HTML" });
  }

  // Significant move alerts
  const { alerts, updatedLastAlertAt } = getSignificantChanges(
    quotes,
    state.previousSnapshot || {},
    state.lastAlertAt || {},
    updatedPriceHistory
  );
  for (const alert of alerts) {
    await sendTelegramMessage(buildAlertMessage(alert), { parseMode: "HTML" });
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
