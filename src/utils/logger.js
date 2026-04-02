const winston = require("winston");

const isProd = process.env.NODE_ENV === "production";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    isProd
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length
              ? " " + JSON.stringify(meta)
              : "";
            return `${timestamp} ${level}: ${message}${metaStr}`;
          }),
        ),
  ),
  transports: [new winston.transports.Console()],
});

module.exports = logger;
