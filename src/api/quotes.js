const { config } = require("../config");
const { fetchCryptoQuotes } = require("../providers/coingecko");
const { fetchYahooQuotes } = require("../providers/yahoo");

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

module.exports = {
  fetchAllQuotes,
};
