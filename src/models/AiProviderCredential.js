const db = require("../config/database");

const PUBLIC_COLUMNS = `
  id, empresa_id, provider, label, key_fingerprint, model, api_style, base_url,
  priority, enabled, status, failure_count, cooldown_until, last_checked_at,
  health_auth_failure_count, last_error_code, last_error, created_at, updated_at
`;

exports.listPublic = async (empresaId) => {
  const result = await db.query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM ai_provider_credentials
     WHERE empresa_id = $1
     ORDER BY priority ASC, id ASC`,
    [empresaId],
  );
  return result.rows;
};

exports.findById = async (empresaId, credentialId) => {
  const result = await db.query(
    `SELECT * FROM ai_provider_credentials
     WHERE empresa_id = $1 AND id = $2`,
    [empresaId, credentialId],
  );
  return result.rows[0] || null;
};

exports.listUsable = async (empresaId) => {
  const result = await db.query(
    `SELECT * FROM ai_provider_credentials
     WHERE empresa_id = $1
       AND enabled = TRUE
       AND status <> 'invalid'
       AND (cooldown_until IS NULL OR cooldown_until <= NOW())
     ORDER BY priority ASC, id ASC`,
    [empresaId],
  );
  return result.rows;
};

exports.create = async ({
  empresaId,
  provider,
  label,
  encrypted,
  model,
  apiStyle,
  baseUrl,
  priority,
  enabled,
  status,
}) => {
  const result = await db.query(
    `INSERT INTO ai_provider_credentials (
       empresa_id, provider, label, api_key_ciphertext, api_key_iv,
       api_key_auth_tag, key_fingerprint, model, api_style, base_url,
       priority, enabled, status, last_checked_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::text,
       CASE WHEN $13::text = 'valid' THEN NOW() ELSE NULL END)
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      empresaId,
      provider,
      label,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
      encrypted.fingerprint,
      model,
      apiStyle,
      baseUrl,
      priority,
      enabled,
      status,
    ],
  );
  return result.rows[0];
};

exports.update = async (
  empresaId,
  credentialId,
  { label, encrypted, model, apiStyle, baseUrl, priority, enabled },
) => {
  const result = await db.query(
    `UPDATE ai_provider_credentials
     SET label = COALESCE($3, label),
         api_key_ciphertext = COALESCE($4, api_key_ciphertext),
         api_key_iv = COALESCE($5, api_key_iv),
         api_key_auth_tag = COALESCE($6, api_key_auth_tag),
         key_fingerprint = COALESCE($7, key_fingerprint),
         model = COALESCE($8, model),
         api_style = COALESCE($9, api_style),
         base_url = COALESCE($10, base_url),
         priority = COALESCE($11, priority),
         enabled = COALESCE($12, enabled),
         status = CASE WHEN $4::text IS NOT NULL THEN 'untested' ELSE status END,
         failure_count = CASE WHEN $4::text IS NOT NULL THEN 0 ELSE failure_count END,
         cooldown_until = CASE WHEN $4::text IS NOT NULL THEN NULL ELSE cooldown_until END,
         updated_at = NOW()
     WHERE empresa_id = $1 AND id = $2
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      empresaId,
      credentialId,
      label,
      encrypted?.ciphertext || null,
      encrypted?.iv || null,
      encrypted?.authTag || null,
      encrypted?.fingerprint || null,
      model,
      apiStyle,
      baseUrl,
      priority,
      enabled,
    ],
  );
  return result.rows[0] || null;
};

exports.markValid = async (empresaId, credentialId) => {
  const result = await db.query(
    `UPDATE ai_provider_credentials
     SET status = 'valid', failure_count = 0, cooldown_until = NULL,
         health_auth_failure_count = 0,
         last_checked_at = NOW(), last_error_code = NULL, last_error = NULL,
         updated_at = NOW()
     WHERE empresa_id = $1 AND id = $2
     RETURNING ${PUBLIC_COLUMNS}`,
    [empresaId, credentialId],
  );
  return result.rows[0] || null;
};

exports.markFailure = async (
  empresaId,
  credentialId,
  { status = "cooldown", errorCode = null, errorMessage = null, cooldownSeconds = 60 } = {},
) => {
  const result = await db.query(
    `UPDATE ai_provider_credentials
     SET status = $3,
         failure_count = failure_count + 1,
         cooldown_until = CASE
           WHEN $3 = 'cooldown' THEN NOW() + make_interval(secs => $6)
           ELSE NULL
         END,
         last_checked_at = NOW(), last_error_code = $4, last_error = $5,
         updated_at = NOW()
     WHERE empresa_id = $1 AND id = $2
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      empresaId,
      credentialId,
      status,
      errorCode,
      String(errorMessage || "").slice(0, 500) || null,
      Math.max(30, Number(cooldownSeconds) || 60),
    ],
  );
  return result.rows[0] || null;
};

exports.markHealthFailure = async (
  empresaId,
  credentialId,
  {
    status = "cooldown",
    errorCode = null,
    errorMessage = null,
    cooldownSeconds = 300,
    disable = false,
    authFailure = false,
  } = {},
) => {
  const result = await db.query(
    `UPDATE ai_provider_credentials
     SET status = $3,
         enabled = CASE WHEN $7 THEN FALSE ELSE enabled END,
         failure_count = failure_count + 1,
         health_auth_failure_count = CASE
           WHEN $8 THEN health_auth_failure_count + 1 ELSE 0
         END,
         cooldown_until = CASE
           WHEN $3 = 'cooldown' THEN NOW() + make_interval(secs => $6)
           ELSE NULL
         END,
         last_checked_at = NOW(), last_error_code = $4, last_error = $5,
         updated_at = NOW()
     WHERE empresa_id = $1 AND id = $2
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      empresaId,
      credentialId,
      status,
      errorCode,
      String(errorMessage || "").slice(0, 500) || null,
      Math.max(30, Number(cooldownSeconds) || 300),
      disable,
      authFailure,
    ],
  );
  return result.rows[0] || null;
};

exports.remove = async (empresaId, credentialId) => {
  const result = await db.query(
    `DELETE FROM ai_provider_credentials
     WHERE empresa_id = $1 AND id = $2
     RETURNING id`,
    [empresaId, credentialId],
  );
  return result.rows[0] || null;
};
