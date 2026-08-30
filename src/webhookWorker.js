const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const logger = require("./utils/logger");
const env = require("./config/env");
const db = require("./config/database");
const { startWebhookWorker } = require("./services/webhookWorkerService");

function parseStatuses(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const pollIntervalMs = Math.max(
  1000,
  Math.trunc(Number(process.env.WEBHOOK_WORKER_POLL_INTERVAL_MS) || 5000),
);
const batchLimit = Math.max(
  1,
  Math.trunc(Number(process.env.WEBHOOK_WORKER_BATCH_LIMIT) || 20),
);
const leaseSeconds = Math.max(
  5,
  Math.trunc(Number(process.env.WEBHOOK_WORKER_LEASE_SECONDS) || 60),
);
const statuses = parseStatuses(process.env.WEBHOOK_WORKER_STATUSES || "failed");

process.on("uncaughtException", (err) => {
  logger.error("webhookWorker uncaughtException", {
    message: err?.message,
    stack: err?.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : undefined;
  logger.error("webhookWorker unhandledRejection", {
    message: error?.message ?? String(reason),
    stack: error?.stack,
  });
  process.exit(1);
});

try {
  env.validate();
} catch (err) {
  logger.error("Falha na validacao de variaveis do webhook worker", {
    message: err?.message || String(err),
  });
  process.exit(1);
}

const worker = startWebhookWorker({
  pollIntervalMs,
  limit: batchLimit,
  leaseSeconds,
  statuses: statuses.length ? statuses : ["failed"],
  runOnStart: true,
});

logger.info("Webhook worker iniciado", {
  pollIntervalMs,
  batchLimit,
  leaseSeconds,
  statuses: statuses.length ? statuses : ["failed"],
});

async function shutdown(signal) {
  logger.info("Encerrando webhook worker", { signal });

  try {
    await worker.stop();
  } catch (err) {
    logger.error("Falha ao encerrar loop do webhook worker", {
      message: err?.message || String(err),
    });
  }

  try {
    await db.end();
  } catch {
    // ignore
  }

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
