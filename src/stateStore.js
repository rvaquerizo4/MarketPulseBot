const fs = require("node:fs/promises");
const path = require("node:path");

const STATE_FILE = path.join(process.cwd(), "data", "state.json");
let saveQueue = Promise.resolve();

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
  recentEvents: [],
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
      recentEvents: parsed.recentEvents || [],
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
  const payload = JSON.stringify(state, null, 2);

  saveQueue = saveQueue
    .catch(() => {
      // Keep the queue alive after a failed write so future saves can proceed.
    })
    .then(async () => {
      await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });

      const tmpFile = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmpFile, payload, "utf8");
      await fs.rename(tmpFile, STATE_FILE);
    });

  await saveQueue;
}

module.exports = {
  loadState,
  saveState,
};
