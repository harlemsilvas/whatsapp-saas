const db = require("../config/database");

exports.create = async ({
  empresaId = null,
  actorType,
  actorId = null,
  actorLabel = null,
  action,
  resourceType,
  resourceId = null,
  requestId = null,
  metadata = {},
}) => {
  const result = await db.query(
    `INSERT INTO admin_audit_logs (
       empresa_id, actor_type, actor_id, actor_label, action, resource_type,
       resource_id, request_id, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     RETURNING *`,
    [
      empresaId,
      actorType,
      actorId,
      actorLabel,
      action,
      resourceType,
      resourceId,
      requestId,
      JSON.stringify(metadata || {}),
    ],
  );
  return result.rows[0];
};
exports.listByEmpresaId = async (empresaId, { limit = 100, offset = 0 } = {}) => {
  const result = await db.query(
    `SELECT *
     FROM admin_audit_logs
     WHERE empresa_id = $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [empresaId, limit, offset],
  );
  return result.rows;
};
