const fs = require("fs");
const path = require("path");
const createMigrationDb = require("./_migrationDb");
const db = createMigrationDb();

async function applyWebhookEventsMigration() {
  const sqlPath = path.resolve(
    __dirname,
    "..",
    "docker",
    "db",
    "migrations",
    "003-webhook-events.sql",
  );
  const sql = fs.readFileSync(sqlPath, "utf8");
  await db.query(sql);
}

async function main() {
  try {
    await applyWebhookEventsMigration();
    // eslint-disable-next-line no-console
    console.log("✅ Migração OK: tabela webhook_events disponível");
  } catch (err) {
    const msg = String(err?.message || "");
    if (
      msg.includes("permission denied for schema public") ||
      msg.includes("must be owner of table") ||
      msg.includes("must be owner")
    ) {
      // eslint-disable-next-line no-console
      console.error(
        "❌ Falha na migração: sem permissão para CREATE/ALTER. Rode com um usuário dono das tabelas ou superusuário do banco.",
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
