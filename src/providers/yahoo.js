const { config } = require("../config");
const { withRetry } = require("../utils/retry");
const { isValidQuote } = require("../utils/quoteValidation");
const { logger } = require("../utils/logger");

function isRetriableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function isRetriableFetchError(error) {
  if (!error) return false;
  if (error.name === "AbortError") return true;
  return /network|fetch|timeout/i.test(String(error.message || ""));
}

async function fetchOneSymbol(symbol, categoryLabel) {
  const normalized = symbol.toUpperCase();
  const url = new URL(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalized)}`
  );
  url.searchParams.set("range", "1d");
  url.searchParams.set("interval", "1m");

  const data = await withRetry(
    async () => {
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
          if (response.status === 404) {
            return null;
          }
          const error = new Error(`Yahoo error (${response.status}) for ${normalized}`);
          error.status = response.status;
          throw error;
        }

        return await response.json();
      } finally {
        clearTimeout(timeout);
      }
    },
    {
      attempts: config.apiRetryAttempts,
      baseDelayMs: config.apiRetryBaseDelayMs,
      backoffMultiplier: config.apiRetryBackoffMultiplier,
      maxDelayMs: config.apiRetryMaxDelayMs,
      shouldRetry: (error) => isRetriableStatus(error.status) || isRetriableFetchError(error),
      onRetry: (error, attempt, delayMs) => {
        logger.warn(
          `[Yahoo:${normalized}] Retry ${attempt}/${config.apiRetryAttempts - 1} in ${delayMs}ms: ${error.message}`
        );
      },
    }
  );

  if (!data) {
    return null;
  }

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

  const quote = {
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

  return isValidQuote(quote) ? quote : null;
}

async function fetchYahooQuotes(symbols, categoryLabel) {
  if (!symbols || symbols.length === 0) return [];

  const settled = await Promise.allSettled(
    symbols.map((symbol) => fetchOneSymbol(symbol, categoryLabel))
  );

  return settled
    .map((entry, index) => {
      if (entry.status === "fulfilled") {
        return entry.value;
      }

      const symbol = symbols[index];
      logger.error(`[Yahoo:${symbol}] Fetch failed: ${entry.reason?.message || entry.reason}`);
      return null;
    })
    .filter(Boolean);
}

module.exports = {
  fetchYahooQuotes,
};
