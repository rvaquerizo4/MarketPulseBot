const { config } = require("../config");
const { fetchCryptoQuotes } = require("../providers/coingecko");
const { fetchYahooQuotes } = require("../providers/yahoo");
const { validateQuotes } = require("../utils/quoteValidation");

async function fetchAllQuotes() {
  const providers = [
    { name: "CoinGecko", call: () => fetchCryptoQuotes(config.cryptoIds) },
    { name: "Yahoo ETF", call: () => fetchYahooQuotes(config.etfSymbols, "ETF") },
    {
      name: "Yahoo Index Fund",
      call: () => fetchYahooQuotes(config.indexFundSymbols, "Index Fund"),
    },
    { name: "Yahoo Stocks", call: () => fetchYahooQuotes(config.stockSymbols, "Stocks") },
  ];

  const settled = await Promise.allSettled(providers.map((provider) => provider.call()));

  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      const providerName = providers[index].name;
      console.error(
        `[Quotes] Provider ${providerName} failed: ${result.reason?.message || result.reason}`
      );
    }
  });

  const quotes = settled
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  const validQuotes = validateQuotes(quotes);

  if (validQuotes.length !== quotes.length) {
    console.warn(
      `[Quotes] Discarded ${quotes.length - validQuotes.length} invalid quote(s) from provider responses`
    );
  }

  if (validQuotes.length === 0) {
    throw new Error("Could not fetch quotes from any provider");
  }

  return validQuotes;
}

module.exports = {
  fetchAllQuotes,
};
