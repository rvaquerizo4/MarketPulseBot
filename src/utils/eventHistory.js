const { escapeHtml, formatPrice, formatPercent } = require("./formatters");

function trimEvents(events, limit) {
  if (!Array.isArray(events)) return [];
  if (!Number.isFinite(limit) || limit <= 0) return [];
  return events.slice(0, limit);
}

function recordEvent(state, event, limit) {
  const entry = {
    at: event.at || new Date().toISOString(),
    type: event.type || "info",
    severity: event.severity || "info",
    title: event.title || "Event",
    message: event.message || "",
    symbol: event.symbol || null,
  };

  const current = Array.isArray(state.recentEvents) ? state.recentEvents : [];
  state.recentEvents = trimEvents([entry, ...current], limit);
  return entry;
}

function buildEventFromAlert(alert) {
  return {
    type: "price-alert",
    severity: alert.level?.key || "warning",
    title: `${alert.level?.label || "Alert"} ${alert.symbol}`,
    message: `${formatPercent(alert.deltaPct)} vs previous check | ${formatPrice(alert.currentPrice, alert.currency)}`,
    symbol: alert.symbol,
  };
}

function buildEventFromMessage(type, message, severity = "info") {
  return {
    type,
    severity,
    title: type,
    message,
  };
}

function formatRecentEvents(events, limit = 5) {
  const selected = trimEvents(events, limit);
  if (selected.length === 0) {
    return "<i>No recent events recorded.</i>";
  }

  return selected
    .map((event, index) => {
      const at = event.at ? new Date(event.at).toLocaleString("es-ES") : "N/D";
      const severityEmoji =
        event.severity === "critical"
          ? "🔴"
          : event.severity === "strong"
            ? "🟠"
            : event.severity === "warning"
              ? "🟡"
              : "🔵";

      return (
        `${index + 1}. ${severityEmoji} <b>${escapeHtml(event.title)}</b>\n` +
        `${escapeHtml(event.message || "")}` +
        `\n<i>${escapeHtml(at)}</i>`
      );
    })
    .join("\n\n");
}

module.exports = {
  recordEvent,
  buildEventFromAlert,
  buildEventFromMessage,
  formatRecentEvents,
};
