const db = require("../config/database");

exports.listByEmpresaId = async (
  empresaId,
  { limit = 50, offset = 0 } = {},
) => {
  const result = await db.query(
    `SELECT
       c.*,
       lm.id AS last_message_id,
       lm.conteudo AS last_message_conteudo,
       lm.direcao AS last_message_direcao,
       lm.tipo AS last_message_tipo,
       lm.created_at AS last_message_created_at,
       COALESCE(uc.unread_count, 0) AS unread_count
     FROM contatos c
     LEFT JOIN LATERAL (
       SELECT m.*
       FROM mensagens m
       WHERE m.empresa_id = c.empresa_id AND m.contato_id = c.id
       ORDER BY m.id DESC
       LIMIT 1
     ) lm ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS unread_count
       FROM mensagens m2
       WHERE m2.empresa_id = c.empresa_id
         AND m2.contato_id = c.id
         AND m2.direcao = 'entrada'
         AND m2.lida_em IS NULL
     ) uc ON true
     WHERE c.empresa_id = $1
     ORDER BY COALESCE(lm.id, 0) DESC, c.id DESC
     LIMIT $2 OFFSET $3`,
    [empresaId, limit, offset],
  );

  return result.rows;
};

exports.listMensagensByContato = async (
  empresaId,
  contatoId,
  { limit = 100, offset = 0, order = "asc" } = {},
) => {
  const direction = String(order).toLowerCase() === "desc" ? "DESC" : "ASC";

  const result = await db.query(
    `SELECT *
     FROM mensagens
     WHERE empresa_id = $1 AND contato_id = $2
     ORDER BY id ${direction}
     LIMIT $3 OFFSET $4`,
    [empresaId, contatoId, limit, offset],
  );

  return result.rows;
};

exports.markEntradaComoLida = async (empresaId, contatoId) => {
  const result = await db.query(
    `UPDATE mensagens
     SET lida_em = NOW()
     WHERE empresa_id = $1
       AND contato_id = $2
       AND direcao = 'entrada'
       AND lida_em IS NULL`,
    [empresaId, contatoId],
  );

  return { updated: result.rowCount };
};
