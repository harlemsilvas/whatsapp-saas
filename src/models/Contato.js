const db = require("../config/database");

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
  const result = await db.query(
    `SELECT *
     FROM contatos
     WHERE empresa_id = $1 AND telefone = $2`,
    [empresaId, telefone],
  );
  return result.rows[0];
};

exports.create = async (empresaId, { nome = null, telefone, tags = null }) => {
  const result = await db.query(
    `INSERT INTO contatos (empresa_id, nome, telefone, tags)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [empresaId, nome, telefone, tags],
  );
  return result.rows[0];
};

exports.update = async (
  empresaId,
  contatoId,
  { nome = null, telefone = null, tags = null },
) => {
  const result = await db.query(
    `UPDATE contatos
     SET
       nome = COALESCE($3, nome),
       telefone = COALESCE($4, telefone),
       tags = COALESCE($5, tags)
     WHERE empresa_id = $1 AND id = $2
     RETURNING *`,
    [empresaId, contatoId, nome, telefone, tags],
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
  let contato = await exports.findByTelefone(empresaId, telefone);
  if (!contato) {
    contato = await exports.create(empresaId, { nome, telefone });
  }
  return contato;
};
