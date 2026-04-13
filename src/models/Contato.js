const db = require("../config/database");
const logger = require("../utils/logger");
const { normalizeTelefoneBR } = require("../utils/phone");

exports.listByEmpresaId = async (
  empresaId,
  { limit = 50, offset = 0 } = {},
) => {
  const result = await db.query(
    `SELECT *
     FROM contatos
     WHERE empresa_id = $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [empresaId, limit, offset],
  );
  return result.rows;
};

exports.findById = async (empresaId, contatoId) => {
  const result = await db.query(
    `SELECT *
     FROM contatos
     WHERE empresa_id = $1 AND id = $2`,
    [empresaId, contatoId],
  );
  return result.rows[0];
};

exports.findByTelefone = async (empresaId, telefone) => {
  const telefoneNorm = normalizeTelefoneBR(telefone);
  if (!telefoneNorm) return null;
  const result = await db.query(
    `SELECT *
     FROM contatos
     WHERE empresa_id = $1
       AND (
         telefone = $2
         OR regexp_replace(telefone, '\\D', '', 'g') = $2
       )
     LIMIT 1`,
    [empresaId, telefoneNorm],
  );
  return result.rows[0];
};

exports.create = async (empresaId, { nome = null, telefone, tags = null }) => {
  const telefoneNorm = normalizeTelefoneBR(telefone);
  const result = await db.query(
    `INSERT INTO contatos (empresa_id, nome, telefone, tags)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [empresaId, nome, telefoneNorm, tags],
  );
  return result.rows[0];
};

exports.update = async (
  empresaId,
  contatoId,
  { nome = null, telefone = null, tags = null },
) => {
  const telefoneNorm = telefone === null ? null : normalizeTelefoneBR(telefone);
  const result = await db.query(
    `UPDATE contatos
     SET
       nome = COALESCE($3, nome),
       telefone = COALESCE($4, telefone),
       tags = COALESCE($5, tags)
     WHERE empresa_id = $1 AND id = $2
     RETURNING *`,
    [empresaId, contatoId, nome, telefoneNorm, tags],
  );
  return result.rows[0];
};

exports.remove = async (empresaId, contatoId) => {
  const result = await db.query(
    `DELETE FROM contatos
     WHERE empresa_id = $1 AND id = $2
     RETURNING id`,
    [empresaId, contatoId],
  );
  return result.rows[0];
};

exports.findOrCreate = async (empresaId, telefone, { nome = null } = {}) => {
  const telefoneNorm = normalizeTelefoneBR(telefone);
  if (!telefoneNorm) return null;

  let contato = await exports.findByTelefone(empresaId, telefoneNorm);
  if (!contato) {
    contato = await exports.create(empresaId, { nome, telefone: telefoneNorm });
  } else if (contato.telefone !== telefoneNorm) {
    // Normaliza registros antigos (com +, espaços, etc.) ao longo do tempo.
    contato = await exports.update(empresaId, contato.id, {
      telefone: telefoneNorm,
    });
  }
  return contato;
};

exports.assumirAtendimento = async (
  empresaId,
  contatoId,
  { assumidoPor = null, pauseMinutes = 60 } = {},
) => {
  const mins = Number.isFinite(Number(pauseMinutes))
    ? Math.max(0, Math.trunc(Number(pauseMinutes)))
    : 60;
  const pausedUntil = mins ? new Date(Date.now() + mins * 60 * 1000) : null;

  const result = await db.query(
    `UPDATE contatos
     SET
       atendimento_modo = 'humano',
       atendimento_pausado_ate = $3,
       ultimo_humano_em = NOW(),
       atendimento_assumido_por = COALESCE($4, atendimento_assumido_por)
     WHERE empresa_id = $1 AND id = $2
     RETURNING *`,
    [empresaId, contatoId, pausedUntil, assumidoPor],
  );
  return result.rows[0];
};

exports.devolverParaBot = async (empresaId, contatoId) => {
  const result = await db.query(
    `UPDATE contatos
     SET
       atendimento_modo = 'bot',
       atendimento_pausado_ate = NULL,
       atendimento_assumido_por = NULL
     WHERE empresa_id = $1 AND id = $2
     RETURNING *`,
    [empresaId, contatoId],
  );
  return result.rows[0];
};

exports.pausarBot = async (
  empresaId,
  contatoId,
  { pauseMinutes = 60 } = {},
) => {
  const mins = Number.isFinite(Number(pauseMinutes))
    ? Math.max(0, Math.trunc(Number(pauseMinutes)))
    : 60;
  const pausedUntil = mins ? new Date(Date.now() + mins * 60 * 1000) : null;

  const result = await db.query(
    `UPDATE contatos
     SET atendimento_pausado_ate = $3
     WHERE empresa_id = $1 AND id = $2
     RETURNING *`,
    [empresaId, contatoId, pausedUntil],
  );
  return result.rows[0];
};

exports.setBotStatus = async (
  empresaId,
  contatoId,
  { reason = null, details = null } = {},
) => {
  const reasonValue = reason === null ? null : String(reason).trim() || null;

  let detailsValue = null;
  if (details === null || typeof details === "undefined") {
    detailsValue = null;
  } else if (typeof details === "string") {
    detailsValue = details.trim() || null;
  } else {
    try {
      detailsValue = JSON.stringify(details);
    } catch {
      detailsValue = String(details);
    }
  }

  try {
    const result = await db.query(
      `UPDATE contatos
       SET
         bot_status_reason = $3::varchar(40),
         bot_status_details = $4::text,
         bot_status_at = CASE WHEN $3::varchar(40) IS NULL THEN NULL ELSE NOW() END
       WHERE empresa_id = $1 AND id = $2
       RETURNING *`,
      [empresaId, contatoId, reasonValue, detailsValue],
    );
    return result.rows[0];
  } catch (err) {
    const msg = String(err?.message || "");
    const missingColumn = err?.code === "42703" || msg.includes("bot_status_");
    if (missingColumn) {
      logger.warn(
        "Colunas bot_status_* ausentes; ignorando atualização de status do bot",
        { empresaId, contatoId },
      );
      return exports.findById(empresaId, contatoId);
    }
    throw err;
  }
};
