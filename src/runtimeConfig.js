const fs = require("node:fs/promises");
const path = require("node:path");
const { config, validateConfig } = require("./config");

const RUNTIME_CONFIG_FILE = path.join(process.cwd(), "data", "runtime-config.json");

const baseConfigSnapshot = JSON.parse(JSON.stringify(config));
let overrides = {};

const editableSettings = {
  CRYPTO_IDS: {
    path: ["cryptoIds"],
    type: "csv",
    description: "Crypto IDs from CoinGecko (comma separated)",
  },
  ETF_SYMBOLS: {
    path: ["etfSymbols"],
    type: "csv",
    description: "ETF tickers (comma separated)",
  },
  INDEX_FUND_SYMBOLS: {
    path: ["indexFundSymbols"],
    type: "csv",
    description: "Index fund tickers (comma separated)",
  },
  STOCK_SYMBOLS: {
    path: ["stockSymbols"],
    type: "csv",
    description: "Stock tickers (comma separated)",
  },
  PRICE_TARGETS: {
    path: ["priceTargets"],
    type: "priceTargets",
    description: "Price targets: SYMBOL:ABOVE|BELOW:VALUE",
  },
  CHECK_INTERVAL_MINUTES: {
    path: ["checkIntervalMs"],
    type: "minutesToMs",
    min: 1,
    description: "Main market check interval in minutes",
  },
  CRYPTO_WARNING_THRESHOLD_PERCENT: {
    path: ["thresholds", "crypto", "warning"],
    type: "number",
    min: 0.01,
    description: "Crypto warning threshold (%)",
  },
  CRYPTO_STRONG_THRESHOLD_PERCENT: {
    path: ["thresholds", "crypto", "strong"],
    type: "number",
    min: 0.01,
    description: "Crypto strong threshold (%)",
  },
  CRYPTO_CRITICAL_THRESHOLD_PERCENT: {
    path: ["thresholds", "crypto", "critical"],
    type: "number",
    min: 0.01,
    description: "Crypto critical threshold (%)",
  },
  ETF_WARNING_THRESHOLD_PERCENT: {
    path: ["thresholds", "etf", "warning"],
    type: "number",
    min: 0.01,
    description: "ETF warning threshold (%)",
  },
  ETF_STRONG_THRESHOLD_PERCENT: {
    path: ["thresholds", "etf", "strong"],
    type: "number",
    min: 0.01,
    description: "ETF strong threshold (%)",
  },
  ETF_CRITICAL_THRESHOLD_PERCENT: {
    path: ["thresholds", "etf", "critical"],
    type: "number",
    min: 0.01,
    description: "ETF critical threshold (%)",
  },
  INDEX_WARNING_THRESHOLD_PERCENT: {
    path: ["thresholds", "index", "warning"],
    type: "number",
    min: 0.01,
    description: "Index warning threshold (%)",
  },
  INDEX_STRONG_THRESHOLD_PERCENT: {
    path: ["thresholds", "index", "strong"],
    type: "number",
    min: 0.01,
    description: "Index strong threshold (%)",
  },
  INDEX_CRITICAL_THRESHOLD_PERCENT: {
    path: ["thresholds", "index", "critical"],
    type: "number",
    min: 0.01,
    description: "Index critical threshold (%)",
  },
  STOCK_WARNING_THRESHOLD_PERCENT: {
    path: ["thresholds", "stock", "warning"],
    type: "number",
    min: 0.01,
    description: "Stock warning threshold (%)",
  },
  STOCK_STRONG_THRESHOLD_PERCENT: {
    path: ["thresholds", "stock", "strong"],
    type: "number",
    min: 0.01,
    description: "Stock strong threshold (%)",
  },
  STOCK_CRITICAL_THRESHOLD_PERCENT: {
    path: ["thresholds", "stock", "critical"],
    type: "number",
    min: 0.01,
    description: "Stock critical threshold (%)",
  },
  ACCUMULATED_CHANGE_WINDOW_MINUTES: {
    path: ["accumulatedChangeWindowMs"],
    type: "minutesToMs",
    min: 1,
    description: "Window for accumulated change (minutes)",
  },
  PRICE_HISTORY_RETENTION_HOURS: {
    path: ["priceHistoryRetentionMs"],
    type: "hoursToMs",
    min: 1,
    description: "Price history retention (hours)",
  },
  ALERT_COOLDOWN_MINUTES: {
    path: ["alertCooldownMs"],
    type: "minutesToMs",
    min: 0,
    description: "Cooldown between alerts for same asset",
  },
  MARKET_OPEN_HOUR: {
    path: ["marketOpenHour"],
    type: "int",
    min: 0,
    max: 23,
    description: "Market open hour (local)",
  },
  MARKET_OPEN_MINUTE: {
    path: ["marketOpenMinute"],
    type: "int",
    min: 0,
    max: 59,
    description: "Market open minute (local)",
  },
  MARKET_CLOSE_HOUR: {
    path: ["marketCloseHour"],
    type: "int",
    min: 0,
    max: 23,
    description: "Market close hour (local)",
  },
  MARKET_CLOSE_MINUTE: {
    path: ["marketCloseMinute"],
    type: "int",
    min: 0,
    max: 59,
    description: "Market close minute (local)",
  },
  COMMAND_POLL_INTERVAL_SECONDS: {
    path: ["commandPollIntervalMs"],
    type: "secondsToMs",
    min: 1,
    description: "Telegram command polling interval",
  },
  TELEGRAM_LONG_POLLING_TIMEOUT_SECONDS: {
    path: ["telegramLongPollingTimeoutSeconds"],
    type: "number",
    min: 0,
    max: 50,
    description: "Telegram long polling timeout",
  },
  TELEGRAM_LONG_POLLING_GRACE_SECONDS: {
    path: ["telegramLongPollingGraceSeconds"],
    type: "number",
    min: 0,
    description: "Telegram long polling grace time",
  },
  TELEGRAM_UPDATES_LIMIT: {
    path: ["telegramUpdatesLimit"],
    type: "int",
    min: 1,
    description: "Telegram updates limit per poll",
  },
  MAX_QUOTE_AGE_MINUTES: {
    path: ["maxQuoteAgeMinutes"],
    type: "number",
    min: 1,
    description: "Max quote age for freshness checks",
  },
  RECENT_EVENTS_LIMIT: {
    path: ["recentEventsLimit"],
    type: "int",
    min: 0,
    description: "Max events stored in state",
  },
  DAILY_REPORT_RECENT_EVENTS_LIMIT: {
    path: ["dailyReportRecentEventsLimit"],
    type: "int",
    min: 0,
    description: "Events shown in daily report",
  },
  API_RETRY_ATTEMPTS: {
    path: ["apiRetryAttempts"],
    type: "int",
    min: 1,
    description: "API retry attempts",
  },
  API_RETRY_BASE_DELAY_MS: {
    path: ["apiRetryBaseDelayMs"],
    type: "int",
    min: 0,
    description: "API retry base delay (ms)",
  },
  API_RETRY_BACKOFF_MULTIPLIER: {
    path: ["apiRetryBackoffMultiplier"],
    type: "number",
    min: 1,
    description: "API retry backoff multiplier",
  },
  API_RETRY_MAX_DELAY_MS: {
    path: ["apiRetryMaxDelayMs"],
    type: "int",
    min: 0,
    description: "API retry max delay (ms)",
  },
  WEB_ENABLED: {
    path: ["webEnabled"],
    type: "bool",
    description: "Enable web dashboard",
  },
  MAX_CSV_SIZE_MB: {
    path: ["maxCsvSizeMb"],
    type: "number",
    min: 1,
    description: "CSV rotation size threshold (MB)",
  },
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getByPath(obj, pathParts) {
  return pathParts.reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setByPath(obj, pathParts, value) {
  let current = obj;
  for (let i = 0; i < pathParts.length - 1; i += 1) {
    current = current[pathParts[i]];
  }
  current[pathParts[pathParts.length - 1]] = value;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePriceTargets(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return [];

  return value
    .split(",")
    .map((segment) => {
      const parts = segment.trim().split(":");
      if (parts.length !== 3) {
        throw new Error(`Invalid PRICE_TARGETS entry: ${segment}`);
      }
      const [symbol, direction, thresholdRaw] = parts;
      const threshold = Number(thresholdRaw);
      const dir = direction.trim().toUpperCase();
      if (!["ABOVE", "BELOW"].includes(dir) || !Number.isFinite(threshold)) {
        throw new Error(`Invalid PRICE_TARGETS entry: ${segment}`);
      }
      return {
        symbol: symbol.trim().toUpperCase(),
        direction: dir,
        threshold,
      };
    })
    .filter(Boolean);
}

function parseNumberWithLimits(rawValue, schema, parseIntMode = false) {
  const num = parseIntMode ? Number.parseInt(String(rawValue), 10) : Number(rawValue);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid numeric value for ${schema.envKey}`);
  }
  if (Number.isFinite(schema.min) && num < schema.min) {
    throw new Error(`${schema.envKey} must be >= ${schema.min}`);
  }
  if (Number.isFinite(schema.max) && num > schema.max) {
    throw new Error(`${schema.envKey} must be <= ${schema.max}`);
  }
  return num;
}

function parseBoolean(rawValue) {
  const value = String(rawValue || "")
    .trim()
    .toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  throw new Error("Boolean value expected (true/false)");
}

function parseSettingValue(schema, rawValue) {
  switch (schema.type) {
    case "csv":
      return parseCsv(rawValue);
    case "priceTargets":
      return parsePriceTargets(rawValue);
    case "number":
      return parseNumberWithLimits(rawValue, schema, false);
    case "int":
      return parseNumberWithLimits(rawValue, schema, true);
    case "minutesToMs":
      return parseNumberWithLimits(rawValue, schema, false) * 60 * 1000;
    case "hoursToMs":
      return parseNumberWithLimits(rawValue, schema, false) * 60 * 60 * 1000;
    case "secondsToMs":
      return parseNumberWithLimits(rawValue, schema, false) * 1000;
    case "bool":
      return parseBoolean(rawValue);
    default:
      throw new Error(`Unsupported setting type for ${schema.envKey}`);
  }
}

function serializeSettingValue(schema, value) {
  switch (schema.type) {
    case "csv":
      return Array.isArray(value) ? value.join(",") : "";
    case "priceTargets":
      return Array.isArray(value)
        ? value
            .map((entry) => `${entry.symbol}:${entry.direction}:${entry.threshold}`)
            .join(",")
        : "";
    case "minutesToMs":
      return String(Number(value) / (60 * 1000));
    case "hoursToMs":
      return String(Number(value) / (60 * 60 * 1000));
    case "secondsToMs":
      return String(Number(value) / 1000);
    case "bool":
      return value ? "true" : "false";
    default:
      return String(value);
  }
}

async function saveOverrides() {
  await fs.mkdir(path.dirname(RUNTIME_CONFIG_FILE), { recursive: true });
  await fs.writeFile(RUNTIME_CONFIG_FILE, JSON.stringify(overrides, null, 2), "utf8");
}

async function loadRuntimeConfig() {
  try {
    const content = await fs.readFile(RUNTIME_CONFIG_FILE, "utf8");
    const parsed = JSON.parse(content);
    overrides = parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    overrides = {};
  }

  for (const [envKey, rawValue] of Object.entries(overrides)) {
    const schema = editableSettings[envKey];
    if (!schema) continue;
    schema.envKey = envKey;
    try {
      const parsed = parseSettingValue(schema, rawValue);
      setByPath(config, schema.path, parsed);
    } catch {
      // Ignore invalid persisted value and keep default from .env
    }
  }

  validateConfig();
}

function getEditableSettings() {
  return Object.entries(editableSettings).map(([envKey, schema]) => {
    const currentValue = getByPath(config, schema.path);
    return {
      key: envKey,
      description: schema.description,
      value: serializeSettingValue(schema, currentValue),
      overridden: Object.prototype.hasOwnProperty.call(overrides, envKey),
    };
  });
}

function getEditableSettingKeys() {
  return Object.keys(editableSettings);
}

async function setEditableSetting(envKey, rawValue) {
  const schema = editableSettings[envKey];
  if (!schema) {
    throw new Error(`Unsupported setting: ${envKey}`);
  }
  schema.envKey = envKey;

  const previousValue = deepClone(getByPath(config, schema.path));
  const parsed = parseSettingValue(schema, rawValue);

  try {
    setByPath(config, schema.path, parsed);
    validateConfig();
    overrides[envKey] = serializeSettingValue(schema, parsed);
    await saveOverrides();
  } catch (error) {
    setByPath(config, schema.path, previousValue);
    throw error;
  }

  return {
    key: envKey,
    value: serializeSettingValue(schema, getByPath(config, schema.path)),
  };
}

async function resetEditableSetting(envKey) {
  const schema = editableSettings[envKey];
  if (!schema) {
    throw new Error(`Unsupported setting: ${envKey}`);
  }

  const previousValue = deepClone(getByPath(config, schema.path));
  const baseValue = deepClone(getByPath(baseConfigSnapshot, schema.path));

  try {
    setByPath(config, schema.path, baseValue);
    validateConfig();
    delete overrides[envKey];
    await saveOverrides();
  } catch (error) {
    setByPath(config, schema.path, previousValue);
    throw error;
  }

  return {
    key: envKey,
    value: serializeSettingValue(schema, getByPath(config, schema.path)),
  };
}

module.exports = {
  loadRuntimeConfig,
  getEditableSettings,
  getEditableSettingKeys,
  setEditableSetting,
  resetEditableSetting,
};
