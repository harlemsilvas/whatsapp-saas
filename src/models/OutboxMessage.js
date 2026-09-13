const crypto = require("crypto");
const db = require("../config/database");

const DEFAULT_LEASE_SECONDS = 60;
const DEFAULT_BACKOFF_SECONDS = 30;
const DEFAULT_MAX_ATTEMPTS = 8;
const PROVIDER_STATUS_RANK = {
  sent: 1,
  delivered: 2,
  read: 3,
};

function normalizeProviderStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function shouldApplyProviderStatus(currentStatus, incomingStatus) {
  const current = normalizeProviderStatus(currentStatus);
  const incoming = normalizeProviderStatus(incomingStatus);

  if (!incoming) return false;
  if (!current || current === incoming) return true;
  if (current === "read" || current === "failed") return false;
  if (incoming === "failed") return !["delivered", "read"].includes(current);

  const currentRank = PROVIDER_STATUS_RANK[current];
  const incomingRank = PROVIDER_STATUS_RANK[incoming];
  if (!incomingRank) return false;
  if (!currentRank) return true;
  return incomingRank >= currentRank;
}

function buildDedupKey({
  empresaId,
  contatoId,
  to,
  channel = "whatsapp",
  messageType = "text",
  content,
  webhookEventId = null,
  commandId = null,
}) {
  const originType = webhookEventId ? "webhook" : commandId ? "command" : null;
  const originId = webhookEventId || commandId || null;
  const hash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        empresaId,
        channel,
        messageType,
        ...(originType
          ? { originType, originId: String(originId) }
          : { contatoId, to, content }),
      }),
    )
    .digest("hex");

  return `${channel}:${empresaId}:${originType || "legacy"}:${hash}`;
}

function sanitizePayload(options) {
  return { useEnvWhatsApp: Boolean(options?.useEnvWhatsApp) };
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
    commandId = null,
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
    webhookEventId,
    commandId,
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
     DO UPDATE SET dedup_key = EXCLUDED.dedup_key
     RETURNING *, (xmax = 0) AS inserted`,
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
      JSON.stringify(sanitizePayload(options)),
    ],
  );

  return result.rows[0] || null;
};

exports.attachMensagem = async (outboxId, mensagemId, client = db) => {
  const result = await client.query(
    `UPDATE outbox_messages
     SET mensagem_id = $2
     WHERE id = $1 AND mensagem_id IS NULL
     RETURNING *`,
    [outboxId, mensagemId],
  );
  return result.rows[0] || null;
};

exports.buildDedupKey = buildDedupKey;

exports.markProcessing = async (
  outboxId,
  {
    leaseToken = null,
    leaseSeconds = DEFAULT_LEASE_SECONDS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = {},
) => {
  const token = String(leaseToken || crypto.randomUUID()).trim();
  const seconds = Math.max(
    5,
    Math.trunc(Number(leaseSeconds) || DEFAULT_LEASE_SECONDS),
  );
  const attempts = Math.max(
    1,
    Math.trunc(Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS),
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
       AND attempt_count < $4
     RETURNING *`,
    [outboxId, token, seconds, attempts],
  );

  return result.rows[0] ? { ...result.rows[0], lease_token: token } : null;
};

exports.markSent = async (outboxId, graphMessageId, leaseToken = null) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
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

    const record = result.rows[0] || null;
    if (record?.mensagem_id && graphMessageId) {
      await client.query(
        `UPDATE mensagens
         SET wa_message_id = COALESCE(wa_message_id, $3)
         WHERE id = $1 AND empresa_id = $2`,
        [record.mensagem_id, record.empresa_id, graphMessageId],
      );
    }

    await client.query("COMMIT");
    return record;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

exports.markFailed = async (
  outboxId,
  err,
  {
    leaseToken = null,
    backoffSeconds = DEFAULT_BACKOFF_SECONDS,
    errorClass = "transient",
    errorCode = null,
  } = {},
) => {
  const seconds = Math.max(
    1,
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
       error_class = $5,
       last_error_code = $6,
       terminal_reason = NULL,
       dead_at = NULL,
       processed_at = NOW()
     WHERE id = $1
       AND ($4::varchar IS NULL OR lease_token = $4)
     RETURNING *`,
    [outboxId, message || null, seconds, leaseToken, errorClass, errorCode],
  );
  return result.rows[0];
};

exports.markDead = async (
  outboxId,
  err,
  {
    leaseToken = null,
    errorClass = "permanent",
    errorCode = null,
    terminalReason = "permanent_error",
  } = {},
) => {
  const message = err?.message ? String(err.message).trim() : String(err || "");
  const result = await db.query(
    `UPDATE outbox_messages
     SET
       status = 'dead',
       lease_token = NULL,
       lease_expires_at = NULL,
       next_retry_at = NULL,
       last_error = $2,
       error_class = $4,
       last_error_code = $5,
       terminal_reason = $6,
       dead_at = NOW(),
       processed_at = NOW()
     WHERE id = $1
       AND ($3::varchar IS NULL OR lease_token = $3)
     RETURNING *`,
    [
      outboxId,
      message || null,
      leaseToken,
      errorClass,
      errorCode,
      terminalReason,
    ],
  );
  return result.rows[0] || null;
};

exports.listRetryable = async (
  { limit = 20, maxAttempts = DEFAULT_MAX_ATTEMPTS } = {},
) => {
  const attempts = Math.max(
    1,
    Math.trunc(Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS),
  );
  const result = await db.query(
    `SELECT *
     FROM outbox_messages
     WHERE status = ANY($1::varchar[])
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
       AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
       AND attempt_count < $3
     ORDER BY created_at ASC
     LIMIT $2`,
    [["pending", "failed"], limit, attempts],
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
       last_error = NULL,
       error_class = NULL,
       last_error_code = NULL,
       terminal_reason = NULL,
       dead_at = NULL,
       attempt_count = 0,
       manual_retry_count = manual_retry_count + 1,
       last_manual_retry_at = NOW()
     WHERE id = $1
       AND status <> 'sent'
       AND NOT (
         status = 'processing'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at >= NOW()
       )
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
       COUNT(*) FILTER (WHERE status = 'dead')::int AS dead,
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
    dead: 0,
    sent: 0,
  };
};

exports.markProviderStatus = async (
  providerMessageId,
  status,
  payload = null,
  { empresaId = null } = {},
) => {
  const normalizedStatus = normalizeProviderStatus(status);
  if (!providerMessageId || !normalizedStatus) return null;

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT *
       FROM outbox_messages
       WHERE provider_message_id = $1
         AND ($2::int IS NULL OR empresa_id = $2)
       LIMIT 1
       FOR UPDATE`,
      [providerMessageId, empresaId],
    );
    const current = currentResult.rows[0] || null;

    if (!current) {
      await client.query("COMMIT");
      return null;
    }

    if (!shouldApplyProviderStatus(current.provider_status, normalizedStatus)) {
      await client.query("COMMIT");
      return {
        ...current,
        reconciliation_applied: false,
        incoming_provider_status: normalizedStatus,
      };
    }

    const serializedPayload = payload ? JSON.stringify(payload) : null;
    const result = await client.query(
      `UPDATE outbox_messages
       SET
         provider_status = $2,
         provider_status_payload = $3::jsonb,
         provider_status_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [current.id, normalizedStatus, serializedPayload],
    );
    const updated = result.rows[0];

    if (updated?.mensagem_id) {
      await client.query(
        `UPDATE mensagens
         SET
           wa_message_id = COALESCE(wa_message_id, $3),
           provider_status = $4,
           provider_status_payload = $5::jsonb,
           provider_status_at = NOW()
         WHERE id = $1 AND empresa_id = $2`,
        [
          updated.mensagem_id,
          updated.empresa_id,
          providerMessageId,
          normalizedStatus,
          serializedPayload,
        ],
      );
    }

    await client.query("COMMIT");
    return { ...updated, reconciliation_applied: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

exports.shouldApplyProviderStatus = shouldApplyProviderStatus;
