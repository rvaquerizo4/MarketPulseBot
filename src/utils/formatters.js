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

module.exports = {
  formatPercent,
  formatPrice,
  formatVolume,
  escapeHtml,
  trendIcon,
  moveBar,
};
