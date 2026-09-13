const db = require("../config/database");

const PUBLIC_COLUMNS = `
  id, empresa_id, label, key_prefix, permissions, enabled, expires_at,
  last_used_at, revoked_at, created_at
`;

exports.findUsableByHash = async (keyHash) => {
  const result = await db.query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM admin_api_keys
     WHERE key_hash = $1
       AND enabled = TRUE
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [keyHash],
  );
  return result.rows[0] || null;
};
exports.touchLastUsed = async (keyId) => {
  await db.query(
    `UPDATE admin_api_keys SET last_used_at = NOW() WHERE id = $1`,
    [keyId],
  );
};

exports.listByEmpresaId = async (empresaId) => {
  const result = await db.query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM admin_api_keys
     WHERE empresa_id = $1
     ORDER BY id DESC`,
    [empresaId],
  );
  return result.rows;
};

exports.create = async ({
  empresaId,
  label,
  keyHash,
  keyPrefix,
  permissions,
  expiresAt,
}) => {
  const result = await db.query(
    `INSERT INTO admin_api_keys (
       empresa_id, label, key_hash, key_prefix, permissions, expires_at
     ) VALUES ($1, $2, $3, $4, $5::text[], $6)
     RETURNING ${PUBLIC_COLUMNS}`,
    [empresaId, label, keyHash, keyPrefix, permissions, expiresAt],
  );
  return result.rows[0];
};

exports.revoke = async (empresaId, keyId) => {
  const result = await db.query(
    `UPDATE admin_api_keys
     SET enabled = FALSE, revoked_at = NOW()
     WHERE id = $1 AND empresa_id = $2
     RETURNING ${PUBLIC_COLUMNS}`,
    [keyId, empresaId],
  );
  return result.rows[0] || null;
};
