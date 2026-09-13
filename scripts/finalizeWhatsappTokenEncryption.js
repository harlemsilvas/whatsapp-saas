const createMigrationDb = require("./_migrationDb");

const db = createMigrationDb();

async function main() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const incomplete = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM empresas
       WHERE whatsapp_token IS NOT NULL
         AND BTRIM(whatsapp_token) <> ''
         AND (
           whatsapp_token_ciphertext IS NULL
           OR whatsapp_token_iv IS NULL
           OR whatsapp_token_auth_tag IS NULL
         )`,
    );
    if (incomplete.rows[0].count > 0) {
      throw new Error(
        `${incomplete.rows[0].count} empresa(s) ainda não possuem cópia criptografada`,
      );
    }

    const result = await client.query(
      `UPDATE empresas
       SET whatsapp_token = NULL
       WHERE whatsapp_token IS NOT NULL`,
    );
    await client.query("COMMIT");
    // eslint-disable-next-line no-console
    console.log(
      `Finalização OK: ${result.rowCount} token(s) removido(s) do campo legado`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    // eslint-disable-next-line no-console
    console.error("Falha ao finalizar criptografia do token", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.end().catch(() => {});
  }
}

main();
