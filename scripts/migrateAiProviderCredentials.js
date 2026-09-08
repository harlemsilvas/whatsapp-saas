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
      "008-ai-provider-credentials.sql",
    );
    await db.query(fs.readFileSync(sqlPath, "utf8"));
    console.log("Migracao OK: credenciais de IA por empresa disponiveis");
  } catch (err) {
    const message = String(err?.message || "");
    if (
      message.includes("permission denied") ||
      message.includes("must be owner")
    ) {
      console.error(
        "Falha na migracao: use o usuario dono das tabelas ou superusuario do banco.",
      );
    } else {
      console.error("Falha na migracao", message);
    }
    process.exitCode = 1;
  } finally {
    await db.end().catch(() => {});
  }
}

main();
