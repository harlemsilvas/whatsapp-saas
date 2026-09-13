const createMigrationDb = require("./_migrationDb");
const {
  decryptSecret,
  fingerprintSecret,
} = require("../src/utils/credentialCrypto");

const db = createMigrationDb();

async function main() {
  try {
    const result = await db.query(
      `SELECT id, whatsapp_token_ciphertext, whatsapp_token_iv,
              whatsapp_token_auth_tag,
              whatsapp_token_fingerprint
       FROM empresas
       WHERE (whatsapp_token IS NOT NULL AND BTRIM(whatsapp_token) <> '')
          OR whatsapp_token_ciphertext IS NOT NULL
       ORDER BY id`,
    );

    let encrypted = 0;
    for (const empresa of result.rows) {
      if (!empresa.whatsapp_token_ciphertext) {
        throw new Error(`Empresa ${empresa.id} sem cópia criptografada do token`);
      }
      const token = decryptSecret({
        ciphertext: empresa.whatsapp_token_ciphertext,
        iv: empresa.whatsapp_token_iv,
        authTag: empresa.whatsapp_token_auth_tag,
      });
      if (
        empresa.whatsapp_token_fingerprint &&
        fingerprintSecret(token) !== empresa.whatsapp_token_fingerprint
      ) {
        throw new Error(`Empresa ${empresa.id} com fingerprint inconsistente`);
      }
      encrypted += 1;
    }

    // eslint-disable-next-line no-console
    console.log(
      `Verificação OK: ${encrypted} token(s) WhatsApp descriptografado(s) sem exposição`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Falha na verificação criptográfica", err.message);
    process.exitCode = 1;
  } finally {
    await db.end().catch(() => {});
  }
}

main();
