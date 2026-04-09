const { config } = require("../config");

async function fetchOneSymbol(symbol, categoryLabel) {
  const normalized = symbol.toUpperCase();
  const url = new URL(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalized)}`
  );
  url.searchParams.set("range", "1d");
  url.searchParams.set("interval", "1m");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || meta.regularMarketPrice == null) {
      return null;
    }

    const previousClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? 0);
    const currentPrice = Number(meta.regularMarketPrice);
    const marketState = String(meta.marketState || "").toUpperCase();
    const regularMarketTimeSec = Number(meta.regularMarketTime ?? 0);
    const lastTradeAt =
      Number.isFinite(regularMarketTimeSec) && regularMarketTimeSec > 0
        ? new Date(regularMarketTimeSec * 1000).toISOString()
        : null;
    const ageMinutes =
      Number.isFinite(regularMarketTimeSec) && regularMarketTimeSec > 0
        ? Math.max(0, (Date.now() - regularMarketTimeSec * 1000) / 60000)
        : null;
    const isStale =
      Number.isFinite(ageMinutes) && ageMinutes > config.maxQuoteAgeMinutes;
    const change24hPct =
      Number.isFinite(previousClose) && previousClose > 0
        ? ((currentPrice - previousClose) / previousClose) * 100
        : 0;

    const longName = String(meta.longName || meta.shortName || normalized);

    return {
      key: `${categoryLabel.toLowerCase()}:${normalized}`,
      category: categoryLabel,
      symbol: normalized,
      name: longName,
      price: currentPrice,
      currency: meta.currency || "USD",
      change24hPct,
      volume: Number(meta.regularMarketVolume ?? 0),
      marketState,
      lastTradeAt,
      ageMinutes: Number.isFinite(ageMinutes) ? Number(ageMinutes.toFixed(1)) : null,
      isStale,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchYahooQuotes(symbols, categoryLabel) {
  if (!symbols || symbols.length === 0) return [];

  const settled = await Promise.allSettled(
    symbols.map((symbol) => fetchOneSymbol(symbol, categoryLabel))
  );

  return settled
    .filter((entry) => entry.status === "fulfilled" && entry.value)
    .map((entry) => entry.value);
}

module.exports = {
  fetchYahooQuotes,
};
