const crypto = require("crypto");
const env = require("../config/env");
const logger = require("../utils/logger");

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function computeSignature256Hex(appSecret, rawBodyBuffer) {
  const hmac = crypto.createHmac("sha256", String(appSecret));
  hmac.update(rawBodyBuffer || Buffer.from(""));
  return `sha256=${hmac.digest("hex")}`;
}

function getHeader(req, name) {
  return req.get(name) || req.get(name.toLowerCase()) || "";
}

/**
 * Verifica assinatura do webhook da Meta (WhatsApp Cloud API).
 * Header esperado: X-Hub-Signature-256: sha256=<hex>
 */
function verifyWhatsAppWebhookSignature(req, res, next) {
  // GET (verificação) não precisa de assinatura.
  if (req.method === "GET") return next();

  const required = env.toBool(
    process.env.REQUIRE_WHATSAPP_WEBHOOK_SIGNATURE,
    process.env.NODE_ENV === "production",
  );

  const appSecret = env.optional("WHATSAPP_APP_SECRET", null);
  if (!appSecret) {
    if (required) {
      logger.error(
        "WHATSAPP_APP_SECRET ausente, mas assinatura do webhook é obrigatória",
      );
      return res.status(500).json({
        error:
          "Configuração do servidor inválida (WHATSAPP_APP_SECRET ausente).",
      });
    }

    logger.warn(
      "Assinatura do webhook não verificada (WHATSAPP_APP_SECRET ausente)",
    );
    return next();
  }

  const signature = getHeader(req, "X-Hub-Signature-256");
  if (!signature) {
    logger.warn("Webhook sem X-Hub-Signature-256");
    return res.sendStatus(401);
  }

  const rawBody = req.rawBody;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    // Sem raw body não dá para garantir validação correta
    logger.error("rawBody ausente para validar assinatura do webhook");
    return res.status(500).json({
      error: "Falha interna ao validar assinatura do webhook.",
    });
  }

  const expected = computeSignature256Hex(appSecret, rawBody);
  const ok = safeEqual(signature, expected);

  if (!ok) {
    logger.warn("Assinatura inválida no webhook", {
      signaturePrefix: String(signature).slice(0, 20),
      expectedPrefix: String(expected).slice(0, 20),
    });
    return res.sendStatus(401);
  }

  return next();
}

module.exports = {
  verifyWhatsAppWebhookSignature,
};
