const db = require("../config/database");

exports.list = async ({ limit = 50, offset = 0 } = {}) => {
  const result = await db.query(
    `SELECT *
     FROM empresas
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return result.rows;
};

exports.findById = async (empresaId) => {
  const result = await db.query("SELECT * FROM empresas WHERE id = $1", [
    empresaId,
  ]);
  return result.rows[0];
};

exports.findByTelefone = async (telefone) => {
  const result = await db.query("SELECT * FROM empresas WHERE telefone = $1", [
    telefone,
  ]);
  return result.rows[0];
};

exports.findByPhoneNumberId = async (phoneNumberId) => {
  const result = await db.query(
    "SELECT * FROM empresas WHERE phone_number_id = $1",
    [phoneNumberId],
  );
  return result.rows[0];
};

// Compatibilidade com o nome antigo (a coluna correta é `telefone`).
exports.findByNumber = async (numero) => exports.findByTelefone(numero);

exports.create = async ({
  nome,
  telefone = null,
  whatsapp_token = null,
  phone_number_id = null,
}) => {
  const result = await db.query(
    `INSERT INTO empresas (nome, telefone, whatsapp_token, phone_number_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [nome, telefone, whatsapp_token, phone_number_id],
  );
  return result.rows[0];
};

exports.update = async (
  empresaId,
  {
    nome = null,
    telefone = null,
    whatsapp_token = null,
    phone_number_id = null,
  },
) => {
  const result = await db.query(
    `UPDATE empresas
     SET
       nome = COALESCE($2, nome),
       telefone = COALESCE($3, telefone),
       whatsapp_token = COALESCE($4, whatsapp_token),
       phone_number_id = COALESCE($5, phone_number_id)
     WHERE id = $1
     RETURNING *`,
    [empresaId, nome, telefone, whatsapp_token, phone_number_id],
  );
  return result.rows[0];
};

exports.remove = async (empresaId) => {
  const result = await db.query(
    `DELETE FROM empresas
     WHERE id = $1
     RETURNING id`,
    [empresaId],
  );
  return result.rows[0];
};
