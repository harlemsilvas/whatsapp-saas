const Contato = require("../models/Contato");
const Empresa = require("../models/Empresa");
const OutboxMessage = require("../models/OutboxMessage");
const logger = require("../utils/logger");
const whatsappService = require("./whatsappService");

function maskPhone(value) {
  if (!value) return "<missing>";
  const s = String(value);
  return `***${s.slice(-4)}`;
}

async function setBotStatusSafe(empresaId, contatoId, payload) {
  if (!contatoId) return;
  try {
    await Contato.setBotStatus(empresaId, contatoId, payload);
  } catch (err) {
    logger.warn("Falha ao atualizar bot_status_* pela outbox", {
      empresaId,
      contatoId,
      message: err?.message || String(err),
    });
  }
}

async function maybeSendReengagementTemplate({
  recipient,
  empresa,
  useEnvWhatsApp,
}) {
  const templateName = String(
    process.env.WHATSAPP_REENGAGE_TEMPLATE_NAME || "",
  ).trim();

  if (!templateName) {
    return {
      attempted: false,
      outcome: "not_configured",
      templateName: null,
      languageCode: null,
    };
  }

  const languageCode = String(
    process.env.WHATSAPP_REENGAGE_TEMPLATE_LANG ||
      process.env.WHATSAPP_TEMPLATE_LANG ||
      "pt_BR",
  ).trim();

  const options = { languageCode };
  if (!useEnvWhatsApp) {
    options.token = empresa?.whatsapp_token || null;
    options.phoneId = empresa?.phone_number_id || null;
  }

  const data = await whatsappService.enviarTemplateMensagem(
    recipient,
    templateName,
    options,
  );

  return {
    attempted: true,
    outcome: "sent",
    templateName,
    languageCode,
    providerMessageId: data?.messages?.[0]?.id || null,
  };
}

async function deliverOutboxMessage(record, { leaseSeconds = 60 } = {}) {
  const claimed = await OutboxMessage.markProcessing(record.id, { leaseSeconds });
  if (!claimed) return { skipped: true };

  const payload = claimed.payload_json || {};
  const useEnvWhatsApp = Boolean(payload.useEnvWhatsApp);
  const empresa = await Empresa.findById(claimed.empresa_id);

  try {
    const options = {};
    if (!useEnvWhatsApp) {
      options.token = payload.token || empresa?.whatsapp_token || null;
      options.phoneId = payload.phoneId || empresa?.phone_number_id || null;
    }

    const data = await whatsappService.enviarMensagem(
      claimed.recipient,
      claimed.content,
      options,
    );

    await OutboxMessage.markSent(
      claimed.id,
      data?.messages?.[0]?.id || null,
      claimed.lease_token || null,
    );

    await setBotStatusSafe(claimed.empresa_id, claimed.contato_id, {
      reason: null,
      details: null,
    });

    return { skipped: false, sent: true };
  } catch (err) {
    if (err?.whatsappReason === "outside_24h_window") {
      const templateResult = await maybeSendReengagementTemplate({
        recipient: claimed.recipient,
        empresa,
        useEnvWhatsApp,
      }).catch(async (templateErr) => {
        await setBotStatusSafe(claimed.empresa_id, claimed.contato_id, {
          reason: "outside_24h_window",
          details: {
            graph: err?.whatsappGraph || null,
            template: {
              attempted: true,
              outcome: "failed",
              message: templateErr?.message || String(templateErr),
            },
          },
        });
        throw templateErr;
      });

      await setBotStatusSafe(claimed.empresa_id, claimed.contato_id, {
        reason: "outside_24h_window",
        details: {
          graph: err?.whatsappGraph || null,
          template: templateResult,
        },
      });

      await OutboxMessage.markSent(
        claimed.id,
        templateResult?.providerMessageId || null,
        claimed.lease_token || null,
      );

      return { skipped: false, sent: true, usedTemplate: true };
    }

    await OutboxMessage.markFailed(claimed.id, err, {
      leaseToken: claimed.lease_token || null,
    });

    logger.error("Falha ao enviar outbox_message", {
      outboxId: claimed.id,
      empresaId: claimed.empresa_id,
      contatoId: claimed.contato_id,
      to: maskPhone(claimed.recipient),
      message: err?.message || String(err),
      code: err?.code || null,
      whatsappReason: err?.whatsappReason || null,
    });

    return { skipped: false, sent: false, failed: true };
  }
}

async function processOutboxBatch({ limit = 20, leaseSeconds = 60 } = {}) {
  const items = await OutboxMessage.listRetryable({ limit });
  const summary = {
    scanned: items.length,
    claimed: 0,
    sent: 0,
    failed: 0,
  };

  for (const item of items) {
    const result = await deliverOutboxMessage(item, { leaseSeconds });
    if (result?.skipped) continue;
    summary.claimed += 1;
    if (result?.sent) summary.sent += 1;
    if (result?.failed) summary.failed += 1;
  }

  return summary;
}

async function retryOutboxMessageById(outboxId, { leaseSeconds = 60 } = {}) {
  const current = await OutboxMessage.findById(outboxId);
  if (!current) return { notFound: true };

  if (current.status === "sent") {
    return { notRetryable: true, reason: "sent", record: current };
  }

  const leaseExpiresAt = current.lease_expires_at
    ? new Date(current.lease_expires_at)
    : null;
  const leaseActive = Boolean(
    leaseExpiresAt?.getTime && leaseExpiresAt.getTime() > Date.now(),
  );

  if (current.status === "processing" && leaseActive) {
    return {
      notRetryable: true,
      reason: "processing_active",
      record: current,
    };
  }

  const reopened = await OutboxMessage.resetForRetry(outboxId);
  if (!reopened) {
    return { notRetryable: true, reason: "reset_failed", record: current };
  }

  const result = await deliverOutboxMessage(reopened, { leaseSeconds });
  return { ...result, record: reopened };
}

module.exports = {
  deliverOutboxMessage,
  processOutboxBatch,
  retryOutboxMessageById,
};
