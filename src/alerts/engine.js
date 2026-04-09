const { config } = require("../config");
const {
  formatPercent,
  formatPrice,
  formatVolume,
  escapeHtml,
} = require("../utils/formatters");

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

function isFreshForAlerts(item) {
  if (!item) return false;
  if (item.category === "Crypto") return true;
  return !item.isStale;
}

function calculatePercentageChange(currentPrice, previousPrice) {
  if (
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(previousPrice) ||
    previousPrice <= 0
  ) {
    return null;
  }

  return ((currentPrice - previousPrice) / previousPrice) * 100;
}

function shouldSendAlert(item, previousSnapshotEntry, lastAlertIsoAt, nowMs = Date.now()) {
  if (!isFreshForAlerts(item)) {
    return false;
  }

  if (
    !previousSnapshotEntry ||
    !Number.isFinite(previousSnapshotEntry.price) ||
    previousSnapshotEntry.price <= 0
  ) {
    return false;
  }

  const deltaPct = calculatePercentageChange(item.price, previousSnapshotEntry.price);
  if (!Number.isFinite(deltaPct)) {
    return false;
  }

  const absDeltaPct = Math.abs(deltaPct);
  const categoryType = getCategoryType(item.category);
  const warningThreshold = config.thresholds[categoryType].warning;
  if (absDeltaPct < warningThreshold) {
    return false;
  }

  const lastAlertMs = lastAlertIsoAt ? Date.parse(lastAlertIsoAt) : 0;
  if (Number.isFinite(lastAlertMs) && nowMs - lastAlertMs < config.alertCooldownMs) {
    return false;
  }

  return true;
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

function checkPriceTargets(quotes, lastPriceTargetAlertAt, nowMs) {
  if (!config.priceTargets || config.priceTargets.length === 0) {
    return { alerts: [], updatedLastAlertAt: lastPriceTargetAlertAt };
  }
  const alerts = [];
  const updatedLastAlertAt = { ...lastPriceTargetAlertAt };

  for (const target of config.priceTargets) {
    const item = quotes.find((q) => q.symbol === target.symbol);
    if (!item || !Number.isFinite(item.price)) continue;
    if (!isFreshForAlerts(item)) continue;

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

function isTimeInWindow(h, m, targetH, targetM, windowMin) {
  const current = h * 60 + m;
  const target = targetH * 60 + targetM;
  return current >= target && current < target + windowMin;
}

function average24hChange(quotes) {
  const valid = quotes.filter((q) => Number.isFinite(q.change24hPct));
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, q) => acc + q.change24hPct, 0);
  return sum / valid.length;
}

function checkMarketSchedule(state, quotes, nowMs, getTodayLocalDate) {
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

function getSignificantChanges(quotes, previousSnapshot, lastAlertAt, priceHistory, nowMs = Date.now()) {
  const alerts = [];
  const updatedLastAlertAt = { ...lastAlertAt };

  for (const item of quotes) {
    const prev = previousSnapshot[item.key];
    const canAlert = shouldSendAlert(item, prev, updatedLastAlertAt[item.key], nowMs);
    if (!canAlert) {
      continue;
    }

    const deltaPct = calculatePercentageChange(item.price, prev.price);
    const absDeltaPct = Math.abs(deltaPct);
    const categoryType = getCategoryType(item.category);

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
  const banner =
    alert.level.key === "critical"
      ? "🚨 <b>Critical Move</b>"
      : alert.level.key === "strong"
        ? "🟠 <b>Strong Move</b>"
        : "🟡 <b>Warning Move</b>";

  const lines = [
    `${banner} ${alert.level.emoji}`,
    `<b>Category:</b> ${escapeHtml(alert.category)}`,
    `<b>Asset:</b> ${displayName}`,
    `<b>Movement:</b> ${direction} <b>${absDelta.toFixed(2)}%</b> since the last check`,
    `<b>Price:</b> ${escapeHtml(formatPrice(alert.previousPrice, alert.currency))} → <b>${escapeHtml(formatPrice(alert.currentPrice, alert.currency))}</b>`,
    `<b>24h:</b> ${escapeHtml(formatPercent(alert.change24hPct))}  |  <b>Vol:</b> ${escapeHtml(formatVolume(alert.volume))}`,
  ];

  if (Number.isFinite(alert.accumulatedChangePct)) {
    lines.push(
      `Accumulated ${Math.round(config.accumulatedChangeWindowMs / 60000)}min: <b>${escapeHtml(formatPercent(alert.accumulatedChangePct))}</b>`
    );
  }

  return lines.join("\n");
}

module.exports = {
  isFreshForAlerts,
  calculatePercentageChange,
  shouldSendAlert,
  checkPriceTargets,
  checkMarketSchedule,
  getSignificantChanges,
  buildAlertMessage,
};
