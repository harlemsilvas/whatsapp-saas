const { Pool } = require("pg");
require("dotenv").config();

function createMigrationDb() {
  return new Pool({
    host: process.env.DB_HOST,
    user: process.env.POSTGRES_SUPERUSER || process.env.DB_USER,
    password: process.env.POSTGRES_SUPERPASS || process.env.DB_PASS,
    database: process.env.POSTGRES_DB || process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 5432,
  });
}

module.exports = createMigrationDb;
