const fs = require("node:fs/promises");
const path = require("node:path");
const { logger } = require("./utils/logger");
const { config } = require("./config");

const CSV_FILE = path.join(process.cwd(), "data", "history.csv");
const CSV_HEADER =
  "timestamp,key,symbol,name,category,price,currency,change24hPct,volume\n";

async function ensureHeader() {
  try {
    await fs.access(CSV_FILE);
  } catch {
    await fs.mkdir(path.dirname(CSV_FILE), { recursive: true });
    await fs.writeFile(CSV_FILE, CSV_HEADER, "utf8");
  }
}

async function appendToCsv(quotes) {
  try {
    await ensureHeader();
    const timestamp = new Date().toISOString();
    const lines = quotes
      .map((q) => {
        const name = String(q.name || q.symbol).replace(/"/g, '""');
        return [
          timestamp,
          q.key,
          q.symbol,
          `"${name}"`,
          q.category,
          q.price,
          q.currency,
          Number.isFinite(q.change24hPct) ? q.change24hPct.toFixed(4) : "",
          Number.isFinite(q.volume) ? q.volume : "",
        ].join(",");
      })
      .join("\n");

    await fs.appendFile(CSV_FILE, lines + "\n", "utf8");
  } catch (err) {
    logger.error(`[CSV Logger] Error: ${err.message}`);
  }
}

async function rotateCsv() {
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.dirname(CSV_FILE);
  const archiveName = `history.${date}.csv`;
  const archivePath = path.join(dir, archiveName);
  try {
    await fs.rename(CSV_FILE, archivePath);
    await fs.writeFile(CSV_FILE, CSV_HEADER, "utf8");
    logger.info(`[CSV Logger] Rotated history.csv → ${archiveName}`);
  } catch (err) {
    logger.error(`[CSV Logger] Rotation error: ${err.message}`);
  }
}

async function rotateIfNeeded() {
  try {
    const stat = await fs.stat(CSV_FILE);
    const sizeMb = stat.size / (1024 * 1024);
    if (sizeMb >= config.maxCsvSizeMb) {
      logger.warn(`[CSV Logger] history.csv is ${sizeMb.toFixed(1)} MB — rotating`);
      await rotateCsv();
    }
  } catch {
    // file does not exist yet, nothing to rotate
  }
}

module.exports = { appendToCsv, rotateIfNeeded };
