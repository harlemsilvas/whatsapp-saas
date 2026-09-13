const fs = require("fs");
const path = require("path");
const createMigrationDb = require("./_migrationDb");
const { encryptSecret } = require("../src/utils/credentialCrypto");

const db = createMigrationDb();

async function backfillTokens() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT id, whatsapp_token
       FROM empresas
       WHERE whatsapp_token IS NOT NULL
         AND BTRIM(whatsapp_token) <> ''
         AND whatsapp_token_ciphertext IS NULL
       FOR UPDATE`,
    );

    for (const empresa of result.rows) {
      const encrypted = encryptSecret(empresa.whatsapp_token);
      await client.query(
        `UPDATE empresas
         SET whatsapp_token_ciphertext = $2,
             whatsapp_token_iv = $3,
             whatsapp_token_auth_tag = $4,
             whatsapp_token_fingerprint = $5,
             whatsapp_token_rotated_at = NOW(),
             whatsapp_token_revoked_at = NULL
         WHERE id = $1`,
        [
          empresa.id,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.authTag,
          encrypted.fingerprint,
        ],
      );
    }

    await client.query("COMMIT");
    return result.rowCount;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    const sqlPath = path.resolve(
      __dirname,
      "..",
      "docker",
      "db",
      "migrations",
      "011-multi-tenant-security.sql",
    );
    await db.query(fs.readFileSync(sqlPath, "utf8"));
    const migrated = await backfillTokens();
    // eslint-disable-next-line no-console
    console.log(
      `Migração OK: segurança multiempresa disponível; ${migrated} token(s) copiado(s) para armazenamento criptografado`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Falha na migração de segurança multiempresa", err.message);
    process.exitCode = 1;
  } finally {
    await db.end().catch(() => {});
  }
}

main();
