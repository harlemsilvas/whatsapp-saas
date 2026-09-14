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
      "012-credential-health.sql",
    );
    await db.query(fs.readFileSync(sqlPath, "utf8"));
    console.log("Migração OK: saúde e alertas de credenciais disponíveis");
  } catch (err) {
    console.error("Falha na migração de saúde das credenciais", err.message);
    process.exitCode = 1;
  } finally {
    await db.end().catch(() => {});
  }
}

main();
