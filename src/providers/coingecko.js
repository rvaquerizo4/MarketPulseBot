const { config } = require("../config");

async function fetchCryptoQuotes(ids) {
  if (!ids || ids.length === 0) return [];

  const url = new URL("https://api.coingecko.com/api/v3/coins/markets");
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("price_change_percentage", "24h");
  url.searchParams.set("sparkline", "false");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`CoinGecko error (${response.status})`);
    }

    const data = await response.json();
    const byId = new Map(data.map((item) => [item.id, item]));

    return ids
      .map((id) => {
        const quote = byId.get(id);
        if (!quote || quote.current_price == null) return null;

        return {
          key: `crypto:${id}`,
          category: "Crypto",
          symbol: String(quote.symbol || id).toUpperCase(),
          name: String(quote.name || quote.symbol || id),
          price: Number(quote.current_price),
          currency: "USD",
          change24hPct: Number(quote.price_change_percentage_24h ?? 0),
          volume: Number(quote.total_volume ?? 0),
        };
      })
      .filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  fetchCryptoQuotes,
};
