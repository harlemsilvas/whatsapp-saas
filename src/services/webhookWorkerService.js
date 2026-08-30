const logger = require("../utils/logger");
const { processOutboxBatch } = require("./outboxService");
const { reprocessFailedEvents } = require("./webhookReplayService");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processWebhookBatch({
  limit = 20,
  leaseSeconds = 60,
  statuses = ["failed"],
} = {}) {
  return reprocessFailedEvents({ limit, leaseSeconds, statuses });
}

async function processWorkerCycle({
  webhookLimit = 20,
  webhookLeaseSeconds = 60,
  webhookStatuses = ["failed"],
  outboxLimit = 20,
  outboxLeaseSeconds = 60,
} = {}) {
  const webhook = await processWebhookBatch({
    limit: webhookLimit,
    leaseSeconds: webhookLeaseSeconds,
    statuses: webhookStatuses,
  });
  const outbox = await processOutboxBatch({
    limit: outboxLimit,
    leaseSeconds: outboxLeaseSeconds,
  });

  return { webhook, outbox };
}

function startWebhookWorker({
  pollIntervalMs = 5000,
  limit = 20,
  leaseSeconds = 60,
  statuses = ["failed"],
  outboxLimit = 20,
  outboxLeaseSeconds = 60,
  runOnStart = true,
} = {}) {
  let running = true;
  let inFlight = false;
  let wakeLoop = null;
  let sleepTimer = null;

  const loop = async () => {
    if (runOnStart) {
      await tick();
    }

    while (running) {
      await new Promise((resolve) => {
        wakeLoop = resolve;
        sleepTimer = setTimeout(resolve, pollIntervalMs);
      });
      wakeLoop = null;
      sleepTimer = null;
      await tick();
    }
  };

  const tick = async () => {
    if (!running || inFlight) return;
    inFlight = true;

    try {
      const summary = await processWorkerCycle({
        webhookLimit: limit,
        webhookLeaseSeconds: leaseSeconds,
        webhookStatuses: statuses,
        outboxLimit,
        outboxLeaseSeconds,
      });

      if (summary.webhook.scanned > 0 || summary.outbox.scanned > 0) {
        logger.info("Webhook worker processou ciclo", {
          webhook: summary.webhook,
          outbox: summary.outbox,
        });
      }
    } catch (err) {
      logger.error("Webhook worker falhou no polling", {
        message: err?.message || String(err),
        code: err?.code || null,
      });
    } finally {
      inFlight = false;
    }
  };

  const runPromise = loop();

  return {
    tick,
    async stop() {
      running = false;
      if (sleepTimer) {
        clearTimeout(sleepTimer);
        sleepTimer = null;
      }
      if (wakeLoop) wakeLoop();
      while (inFlight) {
        await sleep(50);
      }
      await runPromise;
    },
  };
}

module.exports = {
  processWebhookBatch,
  processWorkerCycle,
  startWebhookWorker,
};
