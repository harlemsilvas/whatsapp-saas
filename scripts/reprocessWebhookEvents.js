const db = require("../src/config/database");
const {
  reprocessFailedEvents,
} = require("../src/services/webhookReplayService");

function parseStatuses(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const statusesArg = process.argv.find((arg) => arg.startsWith("--statuses="));

  const limit = limitArg
    ? Math.max(1, Math.trunc(Number(limitArg.split("=")[1]) || 20))
    : 20;
  const statuses = statusesArg
    ? parseStatuses(statusesArg.split("=")[1])
    : ["failed"];

  try {
    const summary = await reprocessFailedEvents({ limit, statuses });
    // eslint-disable-next-line no-console
    console.log(
      `✅ Reprocessamento concluído: ${summary.processed} processados, ${summary.failed} falharam, ${summary.scanned} lidos`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("❌ Falha ao reprocessar webhook_events", err.message);
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
