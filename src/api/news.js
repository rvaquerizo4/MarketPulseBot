// src/api/news.js
// Express route for news by symbol
const { fetchNewsForSymbol } = require('../newsApi');
const { URL } = require('url');

module.exports = async function newsRoute(req, res) {
  let symbol = null;
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    symbol = urlObj.searchParams.get('symbol');
  } catch {
    // fallback: no symbol
  }
  if (!symbol) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: 'Missing symbol' }));
    return;
  }
  try {
    const articles = await fetchNewsForSymbol(symbol);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ articles }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
};
