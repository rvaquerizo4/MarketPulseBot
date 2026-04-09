/**
 * Calculates RSI (Relative Strength Index) using the latest N+1 entries
 * from the price history.
 * @param {Array<{ts: number, price: number}>} entries
 * @param {number} period - number of periods (default 14)
 * @returns {number|null}
 */
function calculateRSI(entries, period = 14) {
  if (!Array.isArray(entries)) return null;

  const sorted = entries
    .filter((e) => Number.isFinite(e.ts) && Number.isFinite(e.price) && e.price > 0)
    .sort((a, b) => a.ts - b.ts);

  if (sorted.length < period + 1) return null;

  const recent = sorted.slice(-(period + 1));

  let gains = 0;
  let losses = 0;

  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i].price - recent[i - 1].price;
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
}

function rsiEmoji(rsi) {
  if (!Number.isFinite(rsi)) return "";
  if (rsi >= 70) return "🔺";
  if (rsi <= 30) return "🔻";
  return "➡️";
}

function rsiLabel(rsi) {
  if (!Number.isFinite(rsi)) return "";
  if (rsi >= 70) return "Overbought";
  if (rsi <= 30) return "Oversold";
  return "Neutral";
}

module.exports = { calculateRSI, rsiEmoji, rsiLabel };
