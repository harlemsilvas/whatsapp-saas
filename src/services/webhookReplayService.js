const WebhookEvent = require("../models/WebhookEvent");
const messageService = require("./messageService");
const logger = require("../utils/logger");

async function reprocessFailedEvents({
  limit = 20,
  statuses = ["failed"],
  leaseSeconds = 60,
} = {}) {
  const events = Array.isArray(statuses) && statuses.length === 1 && statuses[0] === "failed"
    ? await WebhookEvent.listRetryable({ limit })
    : await WebhookEvent.listByStatus(statuses, { limit });
  const summary = {
    scanned: events.length,
    claimed: 0,
    processed: 0,
    failed: 0,
  };

  for (const record of events) {
    const eventKey = record?.event_key || null;
    let claimed = null;

    try {
      claimed = await WebhookEvent.markProcessing(eventKey, { leaseSeconds });
      if (!claimed) continue;
      summary.claimed += 1;
      const event = WebhookEvent.hydrateEvent(record);
      await messageService.processarEvento(event);
      await WebhookEvent.markProcessed(eventKey, claimed.lease_token || null);
      summary.processed += 1;
    } catch (err) {
      await WebhookEvent.markFailed(eventKey, err, {
        leaseToken: claimed?.lease_token || null,
      });
      summary.failed += 1;
      logger.error("Falha ao reprocessar webhook_event", {
        eventKey,
        message: err?.message || String(err),
        code: err?.code || null,
      });
    }
  }

  return summary;
}

module.exports = {
  reprocessFailedEvents,
};
