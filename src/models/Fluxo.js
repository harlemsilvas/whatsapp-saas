const db = require("../config/database");

exports.findMatch = async (empresaId, mensagem) => {
  if (!mensagem) return null;

  const result = await db.query(
    `SELECT gatilho, resposta
     FROM fluxos
     WHERE empresa_id = $1
       AND $2 ILIKE '%' || gatilho || '%'
     ORDER BY char_length(gatilho) DESC, id DESC
     LIMIT 1`,
    [empresaId, String(mensagem)],
  );

  return result.rows[0] || null;
};
