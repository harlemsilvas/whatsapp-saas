require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { runModelCatalogSync } = require("../src/services/aiModelCatalogService");
const AiModelCatalog = require("../src/models/AiModelCatalog");

function valueArg(name) {
  const prefix = `--${name}=`;
  const item = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : null;
}

function positiveInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function withoutModels(summary) {
  return {
    ...summary,
    results: (summary.results || []).map(({ models, ...item }) => item),
  };
}

async function main() {
  try {
    const includeModels = process.argv.includes("--include-models");
    const outputPath = valueArg("output");
    const result = await runModelCatalogSync({
      empresaId: positiveInt(valueArg("empresa-id")),
      credentialId: positiveInt(valueArg("credential-id")),
      provider: valueArg("provider")?.trim().toLowerCase() || null,
      dryRun: process.argv.includes("--dry-run"),
      timeoutMs: positiveInt(valueArg("timeout-ms")) || 15000,
    });
    const output = includeModels || outputPath ? result : withoutModels(result);
    const json = `${JSON.stringify(output, null, 2)}\n`;
    if (outputPath) {
      fs.writeFileSync(path.resolve(process.cwd(), outputPath), json, {
        encoding: "utf8",
        mode: 0o600,
      });
    } else {
      process.stdout.write(json);
    }
    if (result.failed > 0) process.exitCode = 1;
  } catch (err) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: err.message })}\n`);
    process.exitCode = 1;
  } finally {
    await AiModelCatalog.db.end().catch(() => {});
  }
}

main();
