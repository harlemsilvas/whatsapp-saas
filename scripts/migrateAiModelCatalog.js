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
      "013-ai-model-catalog.sql",
    );
    await db.query(fs.readFileSync(sqlPath, "utf8"));
    console.log("Migração OK: catálogo de modelos por credencial disponível");
  } catch (err) {
    console.error("Falha na migração do catálogo de modelos", err.message);
    process.exitCode = 1;
  } finally {
    await db.end().catch(() => {});
  }
}

main();
