const dotenv = require("dotenv");

dotenv.config();

function parseCsv(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Parses PRICE_TARGETS with format: SYMBOL:ABOVE/BELOW:PRICE,...
 * Example: BTC:ABOVE:90000,GLD:BELOW:400
 */
function parsePriceTargets(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((segment) => {
      const parts = segment.trim().split(":");
      if (parts.length !== 3) return null;
      const [symbol, direction, threshold] = parts;
      const num = Number(threshold);
      const dir = direction.trim().toUpperCase();
      if (!["ABOVE", "BELOW"].includes(dir) || !Number.isFinite(num)) return null;
      return { symbol: symbol.trim().toUpperCase(), direction: dir, threshold: num };
    })
    .filter(Boolean);
}

const config = {
  logLevel: process.env.LOG_LEVEL || "info",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  cryptoIds: parseCsv(process.env.CRYPTO_IDS || "bitcoin,ethereum"),
  etfSymbols: parseCsv(process.env.ETF_SYMBOLS || "SPY,QQQ,VOO"),
  indexFundSymbols: parseCsv(process.env.INDEX_FUND_SYMBOLS || "VFIAX,SWPPX"),
  stockSymbols: parseCsv(process.env.STOCK_SYMBOLS || ""),
  priceTargets: parsePriceTargets(process.env.PRICE_TARGETS || ""),
  checkIntervalMs: parseNumber(process.env.CHECK_INTERVAL_MINUTES, 15) * 60 * 1000,
  thresholds: {
    crypto: {
      warning: parseNumber(process.env.CRYPTO_WARNING_THRESHOLD_PERCENT, 3),
      strong: parseNumber(process.env.CRYPTO_STRONG_THRESHOLD_PERCENT, 5),
      critical: parseNumber(process.env.CRYPTO_CRITICAL_THRESHOLD_PERCENT, 7),
    },
    etf: {
      warning: parseNumber(process.env.ETF_WARNING_THRESHOLD_PERCENT, 1),
      strong: parseNumber(process.env.ETF_STRONG_THRESHOLD_PERCENT, 1.5),
      critical: parseNumber(process.env.ETF_CRITICAL_THRESHOLD_PERCENT, 2.5),
    },
    index: {
      warning: parseNumber(process.env.INDEX_WARNING_THRESHOLD_PERCENT, 1.5),
      strong: parseNumber(process.env.INDEX_STRONG_THRESHOLD_PERCENT, 2),
      critical: parseNumber(process.env.INDEX_CRITICAL_THRESHOLD_PERCENT, 3),
    },
    stock: {
      warning: parseNumber(process.env.STOCK_WARNING_THRESHOLD_PERCENT, 1),
      strong: parseNumber(process.env.STOCK_STRONG_THRESHOLD_PERCENT, 1.5),
      critical: parseNumber(process.env.STOCK_CRITICAL_THRESHOLD_PERCENT, 2.5),
    },
  },
  accumulatedChangeWindowMs:
    parseNumber(process.env.ACCUMULATED_CHANGE_WINDOW_MINUTES, 60) * 60 * 1000,
  priceHistoryRetentionMs:
    parseNumber(process.env.PRICE_HISTORY_RETENTION_HOURS, 24) * 60 * 60 * 1000,
  alertCooldownMs: parseNumber(process.env.ALERT_COOLDOWN_MINUTES, 60) * 60 * 1000,
  marketOpenHour: parseNumber(process.env.MARKET_OPEN_HOUR, 15),
  marketOpenMinute: parseNumber(process.env.MARKET_OPEN_MINUTE, 30),
  marketCloseHour: parseNumber(process.env.MARKET_CLOSE_HOUR, 22),
  marketCloseMinute: parseNumber(process.env.MARKET_CLOSE_MINUTE, 0),
  commandPollIntervalMs:
    parseNumber(process.env.COMMAND_POLL_INTERVAL_SECONDS, 30) * 1000,
  telegramLongPollingTimeoutSeconds: parseNumber(
    process.env.TELEGRAM_LONG_POLLING_TIMEOUT_SECONDS,
    25
  ),
  telegramLongPollingGraceSeconds: parseNumber(
    process.env.TELEGRAM_LONG_POLLING_GRACE_SECONDS,
    5
  ),
  telegramUpdatesLimit: parseNumber(process.env.TELEGRAM_UPDATES_LIMIT, 10),
  maxQuoteAgeMinutes: parseNumber(process.env.MAX_QUOTE_AGE_MINUTES, 120),
  recentEventsLimit: parseNumber(process.env.RECENT_EVENTS_LIMIT, 25),
  dailyReportRecentEventsLimit: parseNumber(process.env.DAILY_REPORT_RECENT_EVENTS_LIMIT, 5),
  apiRetryAttempts: parseNumber(process.env.API_RETRY_ATTEMPTS, 3),
  apiRetryBaseDelayMs: parseNumber(process.env.API_RETRY_BASE_DELAY_MS, 500),
  apiRetryBackoffMultiplier: parseNumber(
    process.env.API_RETRY_BACKOFF_MULTIPLIER,
    2
  ),
  apiRetryMaxDelayMs: parseNumber(process.env.API_RETRY_MAX_DELAY_MS, 4000),
  requestTimeoutMs: 15000,
};

function validateConfig() {
  const missing = [];
  if (!config.telegramBotToken) missing.push("TELEGRAM_BOT_TOKEN");
  if (!config.telegramChatId) missing.push("TELEGRAM_CHAT_ID");

  if (
    config.cryptoIds.length === 0 &&
    config.etfSymbols.length === 0 &&
    config.indexFundSymbols.length === 0 &&
    config.stockSymbols.length === 0
  ) {
    missing.push("At least one market in CRYPTO_IDS, ETF_SYMBOLS, INDEX_FUND_SYMBOLS, or STOCK_SYMBOLS");
  }

  if (config.checkIntervalMs <= 0) {
    throw new Error("CHECK_INTERVAL_MINUTES must be greater than 0");
  }

  const groups = ["crypto", "etf", "index", "stock"];
  for (const group of groups) {
    const t = config.thresholds[group];
    if (!(t.warning > 0 && t.strong > 0 && t.critical > 0)) {
      throw new Error(`Thresholds for ${group} must be greater than 0`);
    }
    if (!(t.warning <= t.strong && t.strong <= t.critical)) {
      throw new Error(
        `Threshold order for ${group} must be warning <= strong <= critical`
      );
    }
  }

  if (config.accumulatedChangeWindowMs <= 0) {
    throw new Error("ACCUMULATED_CHANGE_WINDOW_MINUTES must be greater than 0");
  }

  if (config.priceHistoryRetentionMs <= 0) {
    throw new Error("PRICE_HISTORY_RETENTION_HOURS must be greater than 0");
  }

  if (
    !Number.isFinite(config.telegramLongPollingTimeoutSeconds) ||
    config.telegramLongPollingTimeoutSeconds < 0 ||
    config.telegramLongPollingTimeoutSeconds > 50
  ) {
    throw new Error(
      "TELEGRAM_LONG_POLLING_TIMEOUT_SECONDS must be between 0 and 50"
    );
  }

  if (config.commandPollIntervalMs <= 0) {
    throw new Error("COMMAND_POLL_INTERVAL_SECONDS must be greater than 0");
  }

  if (
    !Number.isFinite(config.telegramLongPollingGraceSeconds) ||
    config.telegramLongPollingGraceSeconds < 0
  ) {
    throw new Error("TELEGRAM_LONG_POLLING_GRACE_SECONDS must be 0 or greater");
  }

  if (!Number.isFinite(config.telegramUpdatesLimit) || config.telegramUpdatesLimit <= 0) {
    throw new Error("TELEGRAM_UPDATES_LIMIT must be greater than 0");
  }

  if (!Number.isFinite(config.maxQuoteAgeMinutes) || config.maxQuoteAgeMinutes <= 0) {
    throw new Error("MAX_QUOTE_AGE_MINUTES must be greater than 0");
  }

  if (!Number.isFinite(config.recentEventsLimit) || config.recentEventsLimit < 0) {
    throw new Error("RECENT_EVENTS_LIMIT must be greater than or equal to 0");
  }

  if (
    !Number.isFinite(config.dailyReportRecentEventsLimit) ||
    config.dailyReportRecentEventsLimit < 0
  ) {
    throw new Error(
      "DAILY_REPORT_RECENT_EVENTS_LIMIT must be greater than or equal to 0"
    );
  }

  if (!Number.isFinite(config.apiRetryAttempts) || config.apiRetryAttempts < 1) {
    throw new Error("API_RETRY_ATTEMPTS must be greater than or equal to 1");
  }

  if (!Number.isFinite(config.apiRetryBaseDelayMs) || config.apiRetryBaseDelayMs < 0) {
    throw new Error("API_RETRY_BASE_DELAY_MS must be greater than or equal to 0");
  }

  if (
    !Number.isFinite(config.apiRetryBackoffMultiplier) ||
    config.apiRetryBackoffMultiplier < 1
  ) {
    throw new Error("API_RETRY_BACKOFF_MULTIPLIER must be greater than or equal to 1");
  }

  if (!Number.isFinite(config.apiRetryMaxDelayMs) || config.apiRetryMaxDelayMs < 0) {
    throw new Error("API_RETRY_MAX_DELAY_MS must be greater than or equal to 0");
  }

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}

module.exports = {
  config,
  validateConfig,
};