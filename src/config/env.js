function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === "")
    return defaultValue;
  const s = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return defaultValue;
}

function required(name, { allowEmpty = false } = {}) {
  const value = process.env[name];
  if (value === undefined || value === null) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  const trimmed = String(value).trim();
  if (!allowEmpty && !trimmed) {
    throw new Error(`Variável de ambiente vazia: ${name}`);
  }
  return trimmed;
}

function optional(name, defaultValue = null) {
  const value = process.env[name];
  if (value === undefined || value === null) return defaultValue;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : defaultValue;
}

function validate() {
  const isProd = process.env.NODE_ENV === "production";

  const requireDb = toBool(process.env.REQUIRE_DB_ENV, isProd);
  const requireWhatsApp = toBool(process.env.REQUIRE_WHATSAPP_ENV, isProd);
  const requireVerifyToken = toBool(process.env.REQUIRE_VERIFY_TOKEN, isProd);
  const requireAdminApiKey = toBool(
    process.env.REQUIRE_ADMIN_API_KEY,
    isProd,
  );
  const requireWhatsAppWebhookSignature = toBool(
    process.env.REQUIRE_WHATSAPP_WEBHOOK_SIGNATURE,
    isProd,
  );

  if (requireDb) {
    required("DB_HOST");
    required("DB_USER");
    required("DB_PASS");
    required("DB_NAME");
  }

  if (requireWhatsApp) {
    required("WHATSAPP_URL");
    required("WHATSAPP_TOKEN");
    required("WHATSAPP_PHONE_ID");
  }

  if (requireVerifyToken) {
    required("VERIFY_TOKEN");
  }

  if (requireAdminApiKey) {
    required("ADMIN_API_KEY");
  }

  if (requireWhatsAppWebhookSignature) {
    required("WHATSAPP_APP_SECRET");
  }

  // LOG_LEVEL é opcional; PORT também.
}

module.exports = {
  required,
  optional,
  toBool,
  validate,
};
