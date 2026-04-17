// src/newsApi.js
// Simple NewsAPI.org client for MarketPulseBot
const fetch = require('node-fetch');
// Asegura que URL está disponible (para Node.js < 18)
if (typeof URL === 'undefined') {
  global.URL = require('url').URL;
}

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const BASE_URL = 'https://newsapi.org/v2/everything';

async function fetchNewsForSymbol(symbol, opts = {}) {
  if (!NEWS_API_KEY) throw new Error('NEWS_API_KEY not set in environment');
  const params = new URLSearchParams({
    q: symbol,
    language: 'en',
    sortBy: 'publishedAt',
    pageSize: opts.pageSize || 5,
    apiKey: NEWS_API_KEY,
  });
  const url = `${BASE_URL}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NewsAPI error: ${res.status}`);
  const data = await res.json();
  return data.articles || [];
}

module.exports = { fetchNewsForSymbol };