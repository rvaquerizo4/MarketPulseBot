const fs = require("node:fs/promises");
const path = require("node:path");

const STATE_FILE = path.join(process.cwd(), "data", "state.json");

const DEFAULT_STATE = {
  lastDailyReportDate: null,
  lastWeeklyReportDate: null,
  lastCheckAt: null,
  lastMarketOpenAlertDate: null,
  lastMarketCloseAlertDate: null,
  previousSnapshot: {},
  yesterdaySnapshot: {},
  weeklyStartSnapshot: {},
  lastAlertAt: {},
  lastPriceTargetAlertAt: {},
  priceHistory: {},
  lastUpdateId: 0,
};

async function loadState() {
  try {
    const content = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(content);

    return {
      ...DEFAULT_STATE,
      ...parsed,
      previousSnapshot: parsed.previousSnapshot || {},
      yesterdaySnapshot: parsed.yesterdaySnapshot || {},
      weeklyStartSnapshot: parsed.weeklyStartSnapshot || {},
      lastAlertAt: parsed.lastAlertAt || {},
      lastPriceTargetAlertAt: parsed.lastPriceTargetAlertAt || {},
      priceHistory: parsed.priceHistory || {},
      lastUpdateId: parsed.lastUpdateId || 0,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { ...DEFAULT_STATE };
    }
    throw error;
  }
}

async function saveState(state) {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

module.exports = {
  loadState,
  saveState,
};
