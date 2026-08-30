const messageService = require("../services/messageService");
const WebhookEvent = require("../models/WebhookEvent");
const Empresa = require("../models/Empresa");
const {
  buildPayloadHash,
  extractEvents,
} = require("../services/webhookEventService");
const logger = require("../utils/logger");
const DEFAULT_WEBHOOK_LEASE_SECONDS = 60;

function maskPhone(value) {
  if (!value) return "<missing>";
  const s = String(value);
  const last4 = s.slice(-4);
  return `***${last4}`;
}

exports.receberMensagem = async (req, res, next) => {
  const events = extractEvents(req.body);
  const persistedEvents = [];

  logger.info("Webhook recebido", {
    eventCount: events.length,
  });

  try {
    for (const event of events) {
      let empresaId = null;
      const metaPhoneNumberId = event?.metadata?.phone_number_id
        ? String(event.metadata.phone_number_id).trim()
        : null;

      if (metaPhoneNumberId) {
        const empresa = await Empresa.findByPhoneNumberId(metaPhoneNumberId);
        empresaId = empresa?.id || null;
      }

      const persisted = await WebhookEvent.createReceived({
        event,
        empresaId,
        payloadHash: buildPayloadHash(event),
      });
      persistedEvents.push(persisted);
    }
  } catch (err) {
    logger.error("Erro ao registrar webhook recebido", {
      message: err?.message || String(err),
      code: err?.code || null,
      detail: err?.detail || null,
      where: err?.where || null,
    });
    return res.sendStatus(500);
  }

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const persisted = persistedEvents[i];
    let claimed = null;

    try {
      if (!persisted?.inserted) {
        logger.info("Webhook duplicado já registrado", {
          eventKey: persisted?.event_key || null,
          eventKind: persisted?.event_kind || null,
          status: persisted?.status || null,
        });
        continue;
      }

      claimed = await WebhookEvent.markProcessing(persisted.event_key, {
        leaseSeconds: DEFAULT_WEBHOOK_LEASE_SECONDS,
      });
      if (!claimed) {
        logger.info("Webhook evento nao disponivel para claim", {
          eventKey: persisted?.event_key || null,
        });
        continue;
      }

      if (event.status) {
        logger.info("Webhook status recebido", {
          status: event.status.status,
          id: event.status.id,
          recipient: event.status.recipient_id
            ? `***${String(event.status.recipient_id).slice(-4)}`
            : null,
          timestamp: event.status.timestamp,
        });
      }

      if (event.message) {
        const from = event.message.from ?? req.body?.from;
        logger.info("Webhook mensagem recebida", {
          from: maskPhone(from),
          messageId: event.message.id ? String(event.message.id).trim() : null,
          type: event.message.type || null,
        });
      }

      await messageService.processarEvento(event);
      await WebhookEvent.markProcessed(
        persisted.event_key,
        claimed.lease_token || null,
      );
    } catch (err) {
      await WebhookEvent.markFailed(persisted?.event_key || null, err, {
        leaseToken: claimed?.lease_token || null,
      });
      logger.error("Erro ao processar webhook", {
        message: err?.message || String(err),
        code: err?.code || null,
        detail: err?.detail || null,
        where: err?.where || null,
        eventKey: persisted?.event_key || null,
      });
    }
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
