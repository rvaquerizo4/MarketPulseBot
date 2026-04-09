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

async function fetchCryptoQuotes(ids) {
  if (!ids || ids.length === 0) return [];

  const url = new URL("https://api.coingecko.com/api/v3/coins/markets");
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("price_change_percentage", "24h");
  url.searchParams.set("sparkline", "false");

  const data = await withRetry(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          const error = new Error(`CoinGecko error (${response.status})`);
          error.status = response.status;
          throw error;
        }

        const payload = await response.json();
        if (!Array.isArray(payload)) {
          throw new Error("CoinGecko response is not an array");
        }
        return payload;
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
          `[CoinGecko] Retry ${attempt}/${config.apiRetryAttempts - 1} in ${delayMs}ms: ${error.message}`
        );
      },
    }
  );

  const byId = new Map(
    data
      .filter((item) => item && typeof item.id === "string")
      .map((item) => [item.id, item])
  );

  return ids
    .map((id) => {
      const quote = byId.get(id);
      if (!quote || quote.current_price == null) return null;

      const normalized = {
        key: `crypto:${id}`,
        category: "Crypto",
        symbol: String(quote.symbol || id).toUpperCase(),
        name: String(quote.name || quote.symbol || id),
        price: Number(quote.current_price),
        currency: "USD",
        change24hPct: Number(quote.price_change_percentage_24h ?? 0),
        volume: Number(quote.total_volume ?? 0),
      };

      return isValidQuote(normalized) ? normalized : null;
    })
    .filter(Boolean);
}

module.exports = {
  fetchCryptoQuotes,
};
