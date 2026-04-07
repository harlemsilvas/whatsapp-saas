const db = require("../src/config/database");

async function ensureUnreadSchema() {
  await db.query(
    "ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS lida_em TIMESTAMP NULL",
  );
}

async function main() {
  try {
    await ensureUnreadSchema();
    // eslint-disable-next-line no-console
    console.log("✅ Migração OK: mensagens.lida_em disponível");
  } catch (err) {
    const msg = String(err?.message || "");
    if (
      msg.includes("must be owner of table") ||
      msg.includes("must be owner")
    ) {
      // eslint-disable-next-line no-console
      console.error(
        "❌ Falha na migração: sem permissão para ALTER TABLE. Rode com um usuário dono das tabelas (ex.: DB_USER=postgres/DB_PASS=postgres no docker-compose).",
      );
      process.exitCode = 1;
      return;
    }
    // eslint-disable-next-line no-console
    console.error("❌ Falha na migração", err.message);
    process.exitCode = 1;
  } finally {
    try {
      await db.end();
    } catch {
      // ignore
    }
  }
}

main();
