const crypto = require("crypto");
const db = require("../config/database");

const DEFAULT_LEASE_SECONDS = 60;
const DEFAULT_BACKOFF_SECONDS = 30;

function buildDedupKey({
  empresaId,
  contatoId,
  to,
  channel = "whatsapp",
  messageType = "text",
  content,
}) {
  const hash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        empresaId,
        contatoId,
        to,
        channel,
        messageType,
        content,
      }),
    )
    .digest("hex");

  return `${channel}:${empresaId}:${contatoId || "none"}:${hash}`;
}

exports.createPending = async (
  {
    empresaId,
    contatoId = null,
    mensagemId = null,
    webhookEventId = null,
    to,
    content,
    channel = "whatsapp",
    messageType = "text",
    options = {},
  },
  client = db,
) => {
  const dedupKey = buildDedupKey({
    empresaId,
    contatoId,
    to,
    channel,
    messageType,
    content,
  });

  const result = await client.query(
    `INSERT INTO outbox_messages (
       dedup_key,
       empresa_id,
       contato_id,
       mensagem_id,
       webhook_event_id,
       channel,
       message_type,
       recipient,
       content,
       payload_json,
       status,
       next_retry_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'pending', NOW())
     ON CONFLICT (dedup_key)
     DO NOTHING
     RETURNING *`,
    [
      dedupKey,
      empresaId,
      contatoId,
      mensagemId,
      webhookEventId,
      channel,
      messageType,
      to,
      content,
      JSON.stringify(options || {}),
    ],
  );

  return result.rows[0] || null;
};

exports.markProcessing = async (
  outboxId,
  { leaseToken = null, leaseSeconds = DEFAULT_LEASE_SECONDS } = {},
) => {
  const token = String(leaseToken || crypto.randomUUID()).trim();
  const seconds = Math.max(
    5,
    Math.trunc(Number(leaseSeconds) || DEFAULT_LEASE_SECONDS),
  );

  const result = await db.query(
    `UPDATE outbox_messages
     SET
       status = 'processing',
       attempt_count = attempt_count + 1,
       lease_token = $2,
       lease_expires_at = NOW() + make_interval(secs => $3),
       processed_at = NULL
     WHERE id = $1
       AND (
         status = 'pending'
         OR status = 'failed'
         OR (status = 'processing' AND (lease_expires_at IS NULL OR lease_expires_at < NOW()))
       )
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
     RETURNING *`,
    [outboxId, token, seconds],
  );

  return result.rows[0] ? { ...result.rows[0], lease_token: token } : null;
};

exports.markSent = async (outboxId, graphMessageId, leaseToken = null) => {
  const result = await db.query(
    `UPDATE outbox_messages
     SET
       status = 'sent',
       provider_message_id = $2,
       lease_token = NULL,
       lease_expires_at = NULL,
       last_error = NULL,
       processed_at = NOW()
     WHERE id = $1
       AND ($3::varchar IS NULL OR lease_token = $3)
     RETURNING *`,
    [outboxId, graphMessageId || null, leaseToken],
  );
  return result.rows[0];
};

exports.markFailed = async (
  outboxId,
  err,
  {
    leaseToken = null,
    backoffSeconds = DEFAULT_BACKOFF_SECONDS,
  } = {},
) => {
  const seconds = Math.max(
    DEFAULT_BACKOFF_SECONDS,
    Math.trunc(Number(backoffSeconds) || DEFAULT_BACKOFF_SECONDS),
  );
  const message = err?.message ? String(err.message).trim() : String(err || "");

  const result = await db.query(
    `UPDATE outbox_messages
     SET
       status = 'failed',
       lease_token = NULL,
       lease_expires_at = NULL,
       next_retry_at = NOW() + make_interval(secs => $3),
       last_error = $2,
       processed_at = NOW()
     WHERE id = $1
       AND ($4::varchar IS NULL OR lease_token = $4)
     RETURNING *`,
    [outboxId, message || null, seconds, leaseToken],
  );
  return result.rows[0];
};

exports.listRetryable = async ({ limit = 20 } = {}) => {
  const result = await db.query(
    `SELECT *
     FROM outbox_messages
     WHERE status = ANY($1::varchar[])
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
       AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
     ORDER BY created_at ASC
     LIMIT $2`,
    [["pending", "failed"], limit],
  );
  return result.rows;
};

exports.findById = async (outboxId) => {
  const result = await db.query(
    `SELECT *
     FROM outbox_messages
     WHERE id = $1
     LIMIT 1`,
    [outboxId],
  );
  return result.rows[0] || null;
};

exports.resetForRetry = async (outboxId) => {
  const result = await db.query(
    `UPDATE outbox_messages
     SET
       status = 'pending',
       lease_token = NULL,
       lease_expires_at = NULL,
       next_retry_at = NOW(),
       processed_at = NULL,
       last_error = NULL
     WHERE id = $1
       AND status <> 'sent'
     RETURNING *`,
    [outboxId],
  );
  return result.rows[0] || null;
};

exports.listByEmpresaId = async (
  empresaId,
  { contatoId = null, status = null, limit = 50, offset = 0 } = {},
) => {
  const result = await db.query(
    `SELECT *
     FROM outbox_messages
     WHERE empresa_id = $1
       AND ($2::int IS NULL OR contato_id = $2)
       AND ($3::varchar IS NULL OR status = $3)
     ORDER BY id DESC
     LIMIT $4 OFFSET $5`,
    [empresaId, contatoId, status, limit, offset],
  );
  return result.rows;
};

exports.summaryByEmpresaId = async (empresaId) => {
  const result = await db.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
       COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE status = 'sent')::int AS sent
     FROM outbox_messages
     WHERE empresa_id = $1`,
    [empresaId],
  );
  return result.rows[0] || {
    total: 0,
    pending: 0,
    processing: 0,
    failed: 0,
    sent: 0,
  };
};

exports.markProviderStatus = async (providerMessageId, status, payload = null) => {
  const result = await db.query(
    `UPDATE outbox_messages
     SET
       provider_status = $2,
       provider_status_payload = $3::jsonb,
       provider_status_at = NOW()
     WHERE provider_message_id = $1
     RETURNING *`,
    [
      providerMessageId,
      status ? String(status).trim() : null,
      payload ? JSON.stringify(payload) : null,
    ],
  );
  return result.rows[0] || null;
};
