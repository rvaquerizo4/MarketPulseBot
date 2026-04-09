const { createLogger, format, transports } = require("winston");
const { config } = require("../config");

const level = config.logLevel;

const logger = createLogger({
  level,
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level: logLevel, message, stack }) => {
      const msg = stack || message;
      return `[${timestamp}] ${logLevel.toUpperCase()}: ${msg}`;
    })
  ),
  transports: [new transports.Console()],
});

module.exports = { logger };
