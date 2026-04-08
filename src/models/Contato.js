const db = require("../config/database");
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
