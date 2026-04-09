const { config, validateConfig } = require("./config");
const { loadState, saveState } = require("./stateStore");
const { runCycle, buildDailyReport, fetchAllQuotes } = require("./marketMonitor");
const { sendTelegramMessage } = require("./telegram");
const { pollAndHandle } = require("./telegramCommands");

let cycleRunning = false;

function log(message) {
  const now = new Date().toISOString();
  console.log(`[${now}] ${message}`);
}

async function safeRunCycle(state, options) {
  if (cycleRunning) {
    log("Skipping cycle because the previous one is still running.");
    return state;
  }

  cycleRunning = true;

  try {
    const result = await runCycle(state, options);
    log(
      `Cycle completed. Quotes: ${result.quotesCount}. Alerts sent: ${result.alertsCount}.`
    );
    return state;
  } catch (error) {
    log(`Cycle error: ${error.message}`);

    try {
      await sendTelegramMessage(`Market Watcher error: ${error.message}`);
    } catch (telegramError) {
      log(`Could not notify Telegram about the error: ${telegramError.message}`);
    }

    return state;
  } finally {
    try {
      await saveState(state);
    } catch (saveError) {
      log(`Could not save state: ${saveError.message}`);
    }
    cycleRunning = false;
  }
}

async function main() {
  validateConfig();
  const state = await loadState();

  log("Starting market monitor...");
  await safeRunCycle(state, { isStartup: true });

  setInterval(async () => {
    await safeRunCycle(state, { isStartup: false });
  }, config.checkIntervalMs);

  // Telegram command polling (/report, /price, /status, /help)
  const commandHandlers = { buildDailyReport, fetchAllQuotes };
  setInterval(async () => {
    try {
      await pollAndHandle(state, commandHandlers);
    } catch {
      // Polling errors are non-critical
    }
  }, config.commandPollIntervalMs);

  log(`Background monitor active. Interval: ${Math.round(config.checkIntervalMs / 60000)} minutes.`);
  log(`Telegram command polling: every ${Math.round(config.commandPollIntervalMs / 1000)} seconds.`);
}

main().catch((error) => {
  const message = `Failed to start application: ${error.message}`;
  log(message);
  process.exitCode = 1;
});
