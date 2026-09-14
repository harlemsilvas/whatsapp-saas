require("dotenv").config({ quiet: true });
const { runCredentialHealth } = require("../src/services/credentialHealthService");
const CredentialHealth = require("../src/models/CredentialHealth");

function valueArg(name) {
  const prefix = `--${name}=`;
  const item = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : undefined;
}

async function main() {
  try {
    const summary = await runCredentialHealth({
      dryRun: process.argv.includes("--dry-run"),
      concurrency: valueArg("concurrency"),
      timeoutMs: valueArg("timeout-ms"),
    });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (summary.errors > 0) process.exitCode = 1;
  } catch (err) {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: err.message })}\n`,
    );
    process.exitCode = 1;
  } finally {
    await CredentialHealth.db.end().catch(() => {});
  }
}

main();
