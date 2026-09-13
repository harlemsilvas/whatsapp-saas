const fs = require("fs");
const path = require("path");
const createMigrationDb = require("./_migrationDb");

const db = createMigrationDb();

async function main() {
  try {
    const sqlPath = path.resolve(
      __dirname,
      "..",
      "docker",
      "db",
      "migrations",
      "010-outbox-retry-hardening.sql",
    );
    await db.query(fs.readFileSync(sqlPath, "utf8"));
    // eslint-disable-next-line no-console
    console.log("✅ Migração OK: retries e estado terminal da outbox disponíveis");
  } catch (err) {
    const msg = String(err?.message || "");
    if (
      msg.includes("permission denied for schema public") ||
      msg.includes("must be owner of table") ||
      msg.includes("must be owner")
    ) {
      // eslint-disable-next-line no-console
      console.error(
        "❌ Falha na migração: sem permissão para ALTER TABLE. Rode com um usuário dono das tabelas.",
      );
    } else {
      // eslint-disable-next-line no-console
      console.error("❌ Falha na migração", err.message);
    }
    process.exitCode = 1;
  } finally {
    await db.end().catch(() => {});
  }
}

main();
