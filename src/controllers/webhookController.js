const messageService = require("../services/messageService");
const logger = require("../utils/logger");

function maskPhone(value) {
  if (!value) return "<missing>";
  const s = String(value);
  const last4 = s.slice(-4);
  return `***${last4}`;
}

exports.receberMensagem = async (req, res, next) => {
  const value = req.body?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  const status = value?.statuses?.[0];

  if (status) {
    logger.info("Webhook status recebido", {
      status: status.status,
      id: status.id,
      recipient: status.recipient_id
        ? `***${String(status.recipient_id).slice(-4)}`
        : null,
      timestamp: status.timestamp,
    });
  }

  if (msg) {
    const from = msg?.from ?? req.body?.from;
    const text = msg?.text?.body ?? req.body?.message?.text;
    logger.info("Webhook mensagem recebida", {
      from: maskPhone(from),
      textPreview: text ? String(text).slice(0, 40) : null,
    });
  }

  try {
    await messageService.processar(req.body);
  } catch (err) {
    // Importante: a Meta pode reenviar eventos se não receber 2xx.
    logger.error("Erro ao processar webhook", { message: err.message });
  }

  return res.sendStatus(200);
};

exports.verificarWebhook = (req, res) => {
  const VERIFY_TOKEN = String(
    process.env.VERIFY_TOKEN || process.env.VERIF_TOKEN || "",
  ).trim();
  if (!VERIFY_TOKEN) {
    logger.error("VERIFY_TOKEN não configurado (defina em env)");
    return res.sendStatus(500);
  }

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  logger.info("Webhook verify", {
    mode,
    tokenLen: token ? String(token).length : 0,
  });

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    logger.info("Webhook verificado");
    return res.status(200).send(challenge);
  } else {
    logger.warn("Token inválido no verifyWebhook");
    return res.sendStatus(403);
  }
};
