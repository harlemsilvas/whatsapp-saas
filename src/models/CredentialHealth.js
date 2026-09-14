const db = require("../config/database");

exports.tryLock = async (client) => {
  const result = await client.query(
    "SELECT pg_try_advisory_lock($1) AS acquired",
    [74819325],
  );
  return result.rows[0]?.acquired === true;
};

exports.unlock = async (client) => {
  await client.query("SELECT pg_advisory_unlock($1)", [74819325]);
};

exports.listAiCandidates = async () => {
  const result = await db.query(
    `SELECT * FROM ai_provider_credentials
     WHERE enabled = TRUE
       AND (cooldown_until IS NULL OR cooldown_until <= NOW())
     ORDER BY empresa_id, priority, id`,
  );
  return result.rows;
};

exports.listWhatsappCandidates = async () => {
  const result = await db.query(
    `SELECT * FROM empresas
     WHERE phone_number_id IS NOT NULL
       AND whatsapp_token_ciphertext IS NOT NULL
       AND whatsapp_token_enabled = TRUE
     ORDER BY id`,
  );
  return result.rows;
};

exports.createRun = async (dryRun) => {
  const result = await db.query(
    `INSERT INTO credential_health_runs (dry_run)
     VALUES ($1) RETURNING *`,
    [dryRun],
  );
  return result.rows[0];
};

exports.finishRun = async (runId, status, summary) => {
  const result = await db.query(
    `UPDATE credential_health_runs
     SET finished_at = NOW(), status = $2,
         checked_count = $3, valid_count = $4, warning_count = $5,
         invalid_count = $6, error_count = $7, summary = $8::jsonb
     WHERE id = $1 RETURNING *`,
    [
      runId,
      status,
      summary.checked,
      summary.valid,
      summary.warning,
      summary.invalid,
      summary.errors,
      JSON.stringify(summary),
    ],
  );
  return result.rows[0];
};

exports.markWhatsappValid = async (empresaId, expiresAt, expirySource) => {
  const result = await db.query(
    `UPDATE empresas
     SET whatsapp_token_status = 'valid', whatsapp_token_failure_count = 0,
         whatsapp_token_auth_failure_count = 0,
         whatsapp_token_last_checked_at = NOW(), whatsapp_token_last_valid_at = NOW(),
         whatsapp_token_last_error_code = NULL, whatsapp_token_last_error = NULL,
         whatsapp_token_expires_at = CASE
           WHEN $3::text IS NOT NULL THEN $2 ELSE whatsapp_token_expires_at
         END,
         whatsapp_token_expiry_source = COALESCE($3, whatsapp_token_expiry_source)
     WHERE id = $1 RETURNING *`,
    [empresaId, expiresAt, expirySource],
  );
  return result.rows[0];
};

exports.markWhatsappFailure = async (
  empresaId,
  { status, errorCode, errorMessage, authFailure = false, disable = false },
) => {
  const result = await db.query(
    `UPDATE empresas
     SET whatsapp_token_status = $2,
         whatsapp_token_enabled = CASE WHEN $6 THEN FALSE ELSE whatsapp_token_enabled END,
         whatsapp_token_failure_count = whatsapp_token_failure_count + 1,
         whatsapp_token_auth_failure_count = CASE
           WHEN $5 THEN whatsapp_token_auth_failure_count + 1 ELSE 0
         END,
         whatsapp_token_last_checked_at = NOW(),
         whatsapp_token_last_error_code = $3,
         whatsapp_token_last_error = $4
     WHERE id = $1 RETURNING *`,
    [
      empresaId,
      status,
      errorCode,
      String(errorMessage || "").slice(0, 500),
      authFailure,
      disable,
    ],
  );
  return result.rows[0];
};

exports.upsertAlert = async (alert) => {
  const result = await db.query(
    `INSERT INTO credential_health_alerts (
       empresa_id, credential_type, credential_id, provider, alert_code,
       severity, title, message, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     ON CONFLICT (
       empresa_id, credential_type, COALESCE(credential_id, 0), provider, alert_code
     ) WHERE status = 'active'
     DO UPDATE SET last_detected_at = NOW(), severity = EXCLUDED.severity,
       title = EXCLUDED.title, message = EXCLUDED.message,
       metadata = EXCLUDED.metadata
     RETURNING *`,
    [
      alert.empresaId,
      alert.credentialType,
      alert.credentialId || null,
      alert.provider,
      alert.alertCode,
      alert.severity,
      alert.title,
      alert.message,
      JSON.stringify(alert.metadata || {}),
    ],
  );
  return result.rows[0];
};

exports.markAlertNotified = async (alertId) => {
  await db.query(
    `UPDATE credential_health_alerts
     SET last_notified_at = NOW(), notification_count = notification_count + 1
     WHERE id = $1`,
    [alertId],
  );
};

exports.resolveAlerts = async ({
  empresaId,
  credentialType,
  credentialId,
  alertCodes = null,
}) => {
  const result = await db.query(
    `UPDATE credential_health_alerts
     SET status = 'resolved', resolved_at = NOW()
     WHERE empresa_id = $1 AND credential_type = $2
       AND COALESCE(credential_id, 0) = COALESCE($3, 0)
       AND ($4::text[] IS NULL OR alert_code = ANY($4::text[]))
       AND status = 'active'
     RETURNING *`,
    [empresaId, credentialType, credentialId || null, alertCodes],
  );
  return result.rows;
};

exports.resolveOtherExpirationAlerts = async (empresaId, keepCode) => {
  await db.query(
    `UPDATE credential_health_alerts
     SET status = 'resolved', resolved_at = NOW()
     WHERE empresa_id = $1 AND credential_type = 'whatsapp'
       AND status = 'active'
       AND (alert_code = 'expired' OR alert_code LIKE 'expires_%')
       AND alert_code <> $2`,
    [empresaId, keepCode || ""],
  );
};

exports.listCompanyHealth = async (empresaId) => {
  const [empresa, ai, alerts] = await Promise.all([
    db.query(
      `SELECT id, whatsapp_token_status, whatsapp_token_enabled,
              whatsapp_token_failure_count,
              whatsapp_token_auth_failure_count, whatsapp_token_last_checked_at,
              whatsapp_token_last_valid_at,
              whatsapp_token_last_error_code, whatsapp_token_last_error,
              whatsapp_token_expires_at, whatsapp_token_expiry_source
       FROM empresas WHERE id = $1`,
      [empresaId],
    ),
    db.query(
      `SELECT id, provider, label, model, enabled, status, failure_count,
              cooldown_until, last_checked_at, last_error_code, last_error
       FROM ai_provider_credentials WHERE empresa_id = $1
       ORDER BY priority, id`,
      [empresaId],
    ),
    db.query(
      `SELECT id, credential_type, credential_id, provider, alert_code,
              severity, title, message, first_detected_at, last_detected_at,
              last_notified_at, notification_count
       FROM credential_health_alerts
       WHERE empresa_id = $1 AND status = 'active'
       ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
                last_detected_at DESC`,
      [empresaId],
    ),
  ]);
  return { whatsapp: empresa.rows[0] || null, ai: ai.rows, alerts: alerts.rows };
};

exports.db = db;
