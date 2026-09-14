const db = require("../config/database");
const {
  decryptSecret,
  encryptSecret,
} = require("../utils/credentialCrypto");

function hydrateToken(empresa) {
  if (!empresa) return empresa;
  if (!empresa.whatsapp_token_ciphertext) return empresa;

  const hydrated = {
    ...empresa,
    whatsapp_token: decryptSecret({
      ciphertext: empresa.whatsapp_token_ciphertext,
      iv: empresa.whatsapp_token_iv,
      authTag: empresa.whatsapp_token_auth_tag,
    }),
  };
  delete hydrated.whatsapp_token_ciphertext;
  delete hydrated.whatsapp_token_iv;
  delete hydrated.whatsapp_token_auth_tag;
  return hydrated;
}

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
  return hydrateToken(result.rows[0]);
};

exports.findByTelefone = async (telefone) => {
  const result = await db.query("SELECT * FROM empresas WHERE telefone = $1", [
    telefone,
  ]);
  return hydrateToken(result.rows[0]);
};

exports.findByPhoneNumberId = async (phoneNumberId) => {
  const result = await db.query(
    "SELECT * FROM empresas WHERE phone_number_id = $1",
    [phoneNumberId],
  );
  return hydrateToken(result.rows[0]);
};

// Compatibilidade com o nome antigo (a coluna correta é `telefone`).
exports.findByNumber = async (numero) => exports.findByTelefone(numero);

exports.create = async ({
  nome,
  telefone = null,
  whatsapp_token = null,
  phone_number_id = null,
}) => {
  const encrypted = whatsapp_token ? encryptSecret(whatsapp_token) : null;
  const result = await db.query(
    `INSERT INTO empresas (
       nome, telefone, whatsapp_token, phone_number_id,
       whatsapp_token_ciphertext, whatsapp_token_iv,
       whatsapp_token_auth_tag, whatsapp_token_fingerprint,
       whatsapp_token_rotated_at
     )
     VALUES ($1, $2, NULL, $3, $4, $5, $6, $7,
       CASE WHEN $4::text IS NOT NULL THEN NOW() ELSE NULL END)
     RETURNING *`,
    [
      nome,
      telefone,
      phone_number_id,
      encrypted?.ciphertext || null,
      encrypted?.iv || null,
      encrypted?.authTag || null,
      encrypted?.fingerprint || null,
    ],
  );
  return hydrateToken(result.rows[0]);
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
  const encrypted = whatsapp_token ? encryptSecret(whatsapp_token) : null;
  const result = await db.query(
    `UPDATE empresas
     SET
       nome = COALESCE($2, nome),
       telefone = COALESCE($3, telefone),
       phone_number_id = COALESCE($4, phone_number_id),
       whatsapp_token = CASE WHEN $5::text IS NOT NULL THEN NULL ELSE whatsapp_token END,
       whatsapp_token_ciphertext = COALESCE($5, whatsapp_token_ciphertext),
       whatsapp_token_iv = COALESCE($6, whatsapp_token_iv),
       whatsapp_token_auth_tag = COALESCE($7, whatsapp_token_auth_tag),
       whatsapp_token_fingerprint = COALESCE($8, whatsapp_token_fingerprint),
       whatsapp_token_rotated_at = CASE
         WHEN $5::text IS NOT NULL THEN NOW()
         ELSE whatsapp_token_rotated_at
       END,
       whatsapp_token_status = CASE
         WHEN $4::text IS NOT NULL OR $5::text IS NOT NULL THEN 'untested'
         ELSE whatsapp_token_status
       END,
       whatsapp_token_enabled = CASE
         WHEN $4::text IS NOT NULL OR $5::text IS NOT NULL THEN TRUE
         ELSE whatsapp_token_enabled
       END,
       whatsapp_token_failure_count = CASE
         WHEN $4::text IS NOT NULL OR $5::text IS NOT NULL THEN 0
         ELSE whatsapp_token_failure_count
       END,
       whatsapp_token_auth_failure_count = CASE
         WHEN $4::text IS NOT NULL OR $5::text IS NOT NULL THEN 0
         ELSE whatsapp_token_auth_failure_count
       END,
       whatsapp_token_last_error_code = CASE
         WHEN $4::text IS NOT NULL OR $5::text IS NOT NULL THEN NULL
         ELSE whatsapp_token_last_error_code
       END,
       whatsapp_token_last_error = CASE
         WHEN $4::text IS NOT NULL OR $5::text IS NOT NULL THEN NULL
         ELSE whatsapp_token_last_error
       END,
       whatsapp_token_revoked_at = CASE
         WHEN $4::text IS NOT NULL OR $5::text IS NOT NULL THEN NULL
         ELSE whatsapp_token_revoked_at
       END
     WHERE id = $1
     RETURNING *`,
    [
      empresaId,
      nome,
      telefone,
      phone_number_id,
      encrypted?.ciphertext || null,
      encrypted?.iv || null,
      encrypted?.authTag || null,
      encrypted?.fingerprint || null,
    ],
  );
  return hydrateToken(result.rows[0]);
};

exports.revokeWhatsappToken = async (empresaId) => {
  const result = await db.query(
    `UPDATE empresas
     SET whatsapp_token = NULL,
         whatsapp_token_ciphertext = NULL,
         whatsapp_token_iv = NULL,
         whatsapp_token_auth_tag = NULL,
         whatsapp_token_fingerprint = NULL,
         whatsapp_token_status = 'revoked',
         whatsapp_token_enabled = FALSE,
         whatsapp_token_last_checked_at = NOW(),
         whatsapp_token_last_error_code = 'revoked_by_admin',
         whatsapp_token_last_error = 'Token revogado administrativamente',
         whatsapp_token_revoked_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [empresaId],
  );
  return result.rows[0] || null;
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
