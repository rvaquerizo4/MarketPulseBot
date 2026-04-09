function isValidQuote(quote) {
  if (!quote || typeof quote !== "object") return false;
  if (!quote.key || !quote.symbol || !quote.category) return false;
  if (!Number.isFinite(quote.price) || quote.price <= 0) return false;
  if (!quote.currency || typeof quote.currency !== "string") return false;
  if (!Number.isFinite(quote.change24hPct)) return false;
  if (!Number.isFinite(quote.volume) || quote.volume < 0) return false;
  return true;
}

function validateQuotes(quotes) {
  if (!Array.isArray(quotes)) return [];
  return quotes.filter(isValidQuote);
}

module.exports = {
  isValidQuote,
  validateQuotes,
};
