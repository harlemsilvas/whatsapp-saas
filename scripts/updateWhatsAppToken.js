const fs = require("fs");
const path = require("path");
const readline = require("readline");

require("dotenv").config();

const db = require("../src/config/database");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return String(value).trim();
}

function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    if (!item.startsWith("--")) continue;
    const [key, ...rest] = item.slice(2).split("=");
    args[key] = rest.length ? rest.join("=") : true;
  }
  return args;
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Evita ecoar o token digitado.
    // eslint-disable-next-line no-underscore-dangle
    rl._writeToOutput = () => {};

    rl.question(question, (value) => {
      rl.close();
      process.stdout.write("\n");
      resolve(String(value || "").trim());
    });
  });
}

function printHelp() {
  console.log(
    "Atualiza WHATSAPP_TOKEN no .env e sincroniza no Postgres (empresas.whatsapp_token).\n",
  );
  console.log("Uso:");
  console.log("  npm run token:update");
  console.log("  npm run token:update -- --token=SEU_TOKEN");
  console.log("  npm run token:update -- --empresaId=1");
  console.log("\nObservações:");
  console.log("- Precisa de DB_* configurado no .env e Postgres acessível.");
  console.log(
    "- Valida o token chamando a Graph API (WHATSAPP_URL/WHATSAPP_PHONE_ID).",
  );
}

function upsertEnvLine(envText, key, value) {
  const lines = envText.split(/\r?\n/);
  let found = false;

  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    // Mantém o final com newline.
    if (next.length && next[next.length - 1].trim() !== "") next.push("");
    next.push(`${key}=${value}`);
  }

  return next.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    printHelp();
    return;
  }

  const envPath = path.resolve(process.cwd(), ".env");

  const empresaId = Number(
    args.empresaId || process.env.DEFAULT_EMPRESA_ID || 1,
  );

  const baseUrl = requiredEnv("WHATSAPP_URL").replace(/\/$/, "");
  const phoneId = requiredEnv("WHATSAPP_PHONE_ID");

  const tokenFromArg =
    typeof args.token === "string" ? String(args.token).trim() : "";
  const token =
    tokenFromArg || (await askHidden("Cole o WHATSAPP_TOKEN novo: "));

  if (!token) {
    throw new Error("Token vazio. Abortando.");
  }

  // 1) Atualiza .env
  const currentEnv = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8")
    : "";
  const updatedEnv = upsertEnvLine(currentEnv, "WHATSAPP_TOKEN", token);
  fs.writeFileSync(envPath, updatedEnv, "utf8");

  // 2) Atualiza banco (empresa)
  await db.query(
    "UPDATE empresas SET whatsapp_token = $1, phone_number_id = $2 WHERE id = $3",
    [token, phoneId, empresaId],
  );

  // 3) Sanity-check: chama endpoint simples (não imprime token)
  // Usa o mesmo endpoint que verifyWhatsAppAuth usa.
  const axios = require("axios");
  const url = `${baseUrl}/${phoneId}?fields=display_phone_number,verified_name`;
  await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  const r = await db.query(
    "SELECT id, phone_number_id, length(whatsapp_token) AS token_len FROM empresas WHERE id = $1",
    [empresaId],
  );

  console.log("✅ Token atualizado com sucesso");
  console.log({
    envFile: envPath,
    empresaId,
    phone_number_id: r.rows[0]?.phone_number_id,
    token_len: r.rows[0]?.token_len,
  });
}

main().catch((err) => {
  console.error("❌ Falha ao atualizar token", { message: err.message });
  process.exitCode = 1;
});
