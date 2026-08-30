const crypto = require("crypto");
const db = require("../config/database");
const DEFAULT_LEASE_SECONDS = 60;
const DEFAULT_BACKOFF_SECONDS = 30;

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function buildEventKey(event) {
  const phoneNumberId = String(event?.metadata?.phone_number_id || "").trim();

  if (event?.kind === "message" && event?.message?.id) {
    return `message:${phoneNumberId}:${String(event.message.id).trim()}`;
  }

  if (event?.kind === "status" && event?.status?.id) {
    const statusCode = String(event.status.status || "").trim();
    return `status:${phoneNumberId}:${String(event.status.id).trim()}:${statusCode}`;
  }

  const payloadHash = crypto
    .createHash("sha256")
    .update(stableJson(event?.payload || {}))
    .digest("hex");
  return `${String(event?.kind || "unknown").trim()}:${phoneNumberId}:${payloadHash}`;
}

function sanitizePayload(event) {
  return JSON.stringify({
    kind: event?.kind || null,
    metadata: event?.metadata || null,
    payload: event?.payload || null,
  });
}

exports.buildEventKey = buildEventKey;

exports.hydrateEvent = (record) => {
  const stored = record?.payload_json || {};
  const payload = stored?.payload || {};
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const statuses = Array.isArray(payload?.statuses) ? payload.statuses : [];

  return {
    webhookEventId: record?.id || null,
    kind: stored?.kind || record?.event_kind || "unknown",
    metadata: stored?.metadata || null,
    payload,
    message: messages[0] || null,
    status: statuses[0] || null,
  };
};

exports.createReceived = async ({
  event,
  empresaId = null,
  payloadHash = null,
} = {}) => {
  const eventKey = buildEventKey(event);
  const eventKind = String(event?.kind || "unknown").trim() || "unknown";
  const messageId =
    eventKind === "message" && event?.message?.id
      ? String(event.message.id).trim()
      : null;
  const statusId =
    eventKind === "status" && event?.status?.id
      ? String(event.status.id).trim()
      : null;
  const phoneNumberId = event?.metadata?.phone_number_id
    ? String(event.metadata.phone_number_id).trim()
    : null;

  const result = await db.query(
    `INSERT INTO webhook_events (
       event_key,
       empresa_id,
       event_kind,
       message_id,
       status_id,
       phone_number_id,
       payload_hash,
       payload_json,
       status,
       next_retry_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'received', NOW())
     ON CONFLICT (event_key)
     DO UPDATE SET
       empresa_id = COALESCE(webhook_events.empresa_id, EXCLUDED.empresa_id)
     RETURNING *,
       (xmax = 0) AS inserted`,
    [
      eventKey,
      empresaId,
      eventKind,
      messageId,
      statusId,
      phoneNumberId,
      payloadHash,
      sanitizePayload(event),
    ],
  );

  return result.rows[0];
};

exports.markProcessed = async (eventKey, leaseToken = null) => {
  const result = await db.query(
    `UPDATE webhook_events
     SET
       status = 'processed',
       lease_token = NULL,
       lease_expires_at = NULL,
       processed_at = NOW(),
       last_error = NULL
     WHERE event_key = $1
       AND ($2::varchar IS NULL OR lease_token = $2)
     RETURNING *`,
    [eventKey, leaseToken],
  );
  return result.rows[0];
};

exports.markProcessing = async (
  eventKey,
  { leaseToken = null, leaseSeconds = DEFAULT_LEASE_SECONDS } = {},
) => {
  const token = String(leaseToken || crypto.randomUUID()).trim();
  const seconds = Math.max(5, Math.trunc(Number(leaseSeconds) || DEFAULT_LEASE_SECONDS));
  const result = await db.query(
    `UPDATE webhook_events
     SET
       status = 'processing',
       attempt_count = attempt_count + 1,
       lease_token = $2,
       lease_expires_at = NOW() + make_interval(secs => $3),
       processed_at = NULL
     WHERE event_key = $1
       AND (
         status = 'received'
         OR status = 'failed'
         OR (status = 'processing' AND (lease_expires_at IS NULL OR lease_expires_at < NOW()))
       )
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
     RETURNING *`,
    [eventKey, token, seconds],
  );
  return result.rows[0] ? { ...result.rows[0], lease_token: token } : null;
};

exports.markFailed = async (
  eventKey,
  err,
  {
    leaseToken = null,
    backoffSeconds = DEFAULT_BACKOFF_SECONDS,
  } = {},
) => {
  const message = err?.message ? String(err.message).trim() : String(err || "");
  const seconds = Math.max(
    DEFAULT_BACKOFF_SECONDS,
    Math.trunc(Number(backoffSeconds) || DEFAULT_BACKOFF_SECONDS),
  );
  const result = await db.query(
    `UPDATE webhook_events
     SET
       status = 'failed',
       lease_token = NULL,
       lease_expires_at = NULL,
       next_retry_at = NOW() + make_interval(secs => $3),
       processed_at = NOW(),
       last_error = $2
     WHERE event_key = $1
       AND ($4::varchar IS NULL OR lease_token = $4)
     RETURNING *`,
    [eventKey, message || null, seconds, leaseToken],
  );
  return result.rows[0];
};

exports.listByStatus = async (
  statuses = ["failed"],
  { limit = 20 } = {},
) => {
  const normalizedStatuses = Array.isArray(statuses)
    ? statuses.map((item) => String(item).trim()).filter(Boolean)
    : [String(statuses || "").trim()].filter(Boolean);

  if (!normalizedStatuses.length) return [];

  const result = await db.query(
    `SELECT *
     FROM webhook_events
     WHERE status = ANY($1::varchar[])
     ORDER BY created_at ASC
     LIMIT $2`,
    [normalizedStatuses, limit],
  );
  return result.rows;
};

exports.listRetryable = async ({ limit = 20 } = {}) => {
  const result = await db.query(
    `SELECT *
     FROM webhook_events
     WHERE status = ANY($1::varchar[])
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
       AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
     ORDER BY created_at ASC
     LIMIT $2`,
    [["received", "failed"], limit],
  );
  return result.rows;
};
