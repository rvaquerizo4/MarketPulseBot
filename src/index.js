const { config, validateConfig } = require("./config");
const { loadState, saveState } = require("./stateStore");
const { runCycle, buildDailyReport, fetchAllQuotes } = require("./marketMonitor");
const { sendTelegramMessage } = require("./telegram");
const { pollAndHandle } = require("./telegramCommands");
const { startWebServer } = require("./webServer");
const { logger } = require("./utils/logger");

let cycleRunning = false;

async function safeRunCycle(state, options) {
  if (cycleRunning) {
    logger.warn("Skipping cycle because the previous one is still running.");
    return state;
  }

  cycleRunning = true;

  try {
    const result = await runCycle(state, options);
    logger.info(
      `Cycle completed. Quotes: ${result.quotesCount}. Alerts sent: ${result.alertsCount}.`
    );
    return state;
  } catch (error) {
    logger.error(`Cycle error: ${error.message}`);

    try {
      await sendTelegramMessage(
        `Market Watcher critical error: ${error.message}\nThe bot will retry in the next cycle.`
      );
    } catch (telegramError) {
      logger.error(
        `Could not notify Telegram about the error: ${telegramError.message}`
      );
    }

    return state;
  } finally {
    try {
      await saveState(state);
    } catch (saveError) {
      logger.error(`Could not save state: ${saveError.message}`);
    }
    cycleRunning = false;
  }
}

async function main() {
  validateConfig();
  const state = await loadState();

  if (config.webEnabled) {
    startWebServer(state);
  }

  logger.info("Starting market monitor...");
  await safeRunCycle(state, { isStartup: true });

  setInterval(async () => {
    await safeRunCycle(state, { isStartup: false });
  }, config.checkIntervalMs);

  // Telegram command polling (/report, /price, /status, /help)
  const commandHandlers = { buildDailyReport, fetchAllQuotes };
  setInterval(async () => {
    try {
      await pollAndHandle(state, commandHandlers);
    } catch (error) {
      logger.warn(`Telegram polling error: ${error.message}`);
    }
  }, config.commandPollIntervalMs);

  logger.info(
    `Background monitor active. Interval: ${Math.round(config.checkIntervalMs / 60000)} minutes.`
  );
  logger.info(
    `Telegram command polling: every ${Math.round(config.commandPollIntervalMs / 1000)} seconds.`
  );
}

main().catch((error) => {
  const message = `Failed to start application: ${error.message}`;
  logger.error(message);
  process.exitCode = 1;
});
