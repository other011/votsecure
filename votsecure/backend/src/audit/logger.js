/**
 * backend/src/audit/logger.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Logger centralizat bazat pe winston.
 * Responsabilitate: logging structurat (console + fișier).
 */

const { createLogger, format, transports } = require("winston");
const path = require("path");

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
          return `${timestamp} [${level}] ${message}${metaStr}`;
        })
      ),
    }),
    new transports.File({
      filename: process.env.AUDIT_LOG_FILE || path.join(__dirname, "../../../../logs/app.log"),
      maxsize:  10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

module.exports = logger;
