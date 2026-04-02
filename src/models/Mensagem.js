const db = require("../config/database");

exports.listByEmpresaId = async (
  empresaId,
  { contatoId = null, direcao = null, limit = 50, offset = 0 } = {},
) => {
  const result = await db.query(
    `SELECT *
     FROM mensagens
     WHERE empresa_id = $1
       AND ($2::int IS NULL OR contato_id = $2)
       AND ($3::text IS NULL OR direcao = $3)
     ORDER BY id DESC
     LIMIT $4 OFFSET $5`,
    [empresaId, contatoId, direcao, limit, offset],
  );
  return result.rows;
};

exports.findById = async (empresaId, mensagemId) => {
  const result = await db.query(
    `SELECT *
     FROM mensagens
     WHERE empresa_id = $1 AND id = $2`,
    [empresaId, mensagemId],
  );
  return result.rows[0];
};

exports.create = async (...args) => {
  // Suporta ambos:
  // - create(empresaId, { contato_id, direcao, conteudo, tipo })
  // - create({ empresa_id, contato_id, direcao, conteudo, tipo })
  let empresaId;
  let contatoId;
  let direcao;
  let conteudo;
  let tipo;

  if (args.length === 1 && args[0] && typeof args[0] === "object") {
    empresaId = args[0].empresa_id;
    contatoId = args[0].contato_id ?? null;
    direcao = args[0].direcao;
    conteudo = args[0].conteudo;
    tipo = args[0].tipo ?? "text";
  } else {
    empresaId = args[0];
    const payload = args[1] || {};
    contatoId = payload.contato_id ?? null;
    direcao = payload.direcao;
    conteudo = payload.conteudo;
    tipo = payload.tipo ?? "text";
  }

  const result = await db.query(
    `INSERT INTO mensagens (empresa_id, contato_id, direcao, conteudo, tipo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [empresaId, contatoId, direcao, conteudo, tipo],
  );
  return result.rows[0];
};

exports.remove = async (empresaId, mensagemId) => {
  const result = await db.query(
    `DELETE FROM mensagens
     WHERE empresa_id = $1 AND id = $2
     RETURNING id`,
    [empresaId, mensagemId],
  );
  return result.rows[0];
};

exports.listByContato = async (
  empresaId,
  contatoId,
  { limit = 50, offset = 0 } = {},
) => {
  const result = await db.query(
    `SELECT *
     FROM mensagens
     WHERE empresa_id = $1 AND contato_id = $2
     ORDER BY id DESC
     LIMIT $3 OFFSET $4`,
    [empresaId, contatoId, limit, offset],
  );
  return result.rows;
};
