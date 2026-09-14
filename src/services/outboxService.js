const Contato = require("../models/Contato");
const Empresa = require("../models/Empresa");
const OutboxMessage = require("../models/OutboxMessage");
const logger = require("../utils/logger");
const whatsappService = require("./whatsappService");

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 130429, 131048, 131056]);

function positiveInteger(value, fallback) {
  return Math.max(1, Math.trunc(Number(value) || fallback));
}

function getMaxAttempts() {
  return positiveInteger(process.env.OUTBOX_MAX_ATTEMPTS, 8);
}

function classifyOutboxError(err) {
  const graph = err?.response?.data?.error || err?.whatsappGraph || {};
  const status = Number(err?.response?.status || 0) || null;
  const graphCode = Number(graph?.code || 0) || null;
  const rawCode = graphCode || err?.code || status || "unknown";
  const code = String(rawCode).slice(0, 80);

  if (status === 429 || RATE_LIMIT_CODES.has(graphCode)) {
    return { errorClass: "rate_limit", errorCode: code, retryable: true };
  }

  if (!status || [408, 425].includes(status) || status >= 500) {
    return { errorClass: "transient", errorCode: code, retryable: true };
  }

  if (status >= 400 && status < 500) {
    return { errorClass: "permanent", errorCode: code, retryable: false };
  }

  return { errorClass: "transient", errorCode: code, retryable: true };
}

function calculateBackoffSeconds(attemptCount, random = Math.random) {
  const base = positiveInteger(process.env.OUTBOX_RETRY_BASE_SECONDS, 30);
  const max = Math.max(
    base,
    positiveInteger(process.env.OUTBOX_RETRY_MAX_SECONDS, 3600),
  );
  const ratio = Math.min(
    0.5,
    Math.max(0, Number(process.env.OUTBOX_RETRY_JITTER_RATIO ?? 0.2) || 0),
  );
  const attempt = positiveInteger(attemptCount, 1);
  const exponential = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  const jitter = 1 + (Number(random()) * 2 - 1) * ratio;
  return Math.max(1, Math.min(max, Math.round(exponential * jitter)));
}

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

async function deliverOutboxMessage(
  record,
  { leaseSeconds = 60, maxAttempts = getMaxAttempts() } = {},
) {
  const claimed = await OutboxMessage.markProcessing(record.id, {
    leaseSeconds,
    maxAttempts,
  });
  if (!claimed) return { skipped: true };

  const payload = claimed.payload_json || {};
  const useEnvWhatsApp = Boolean(payload.useEnvWhatsApp);
  const empresa = await Empresa.findById(claimed.empresa_id);

  try {
    if (!useEnvWhatsApp && empresa?.whatsapp_token_enabled === false) {
      const error = new Error("Token WhatsApp desativado pela rotina de saúde");
      error.response = { status: 401, data: { error: { code: "credential_disabled" } } };
      throw error;
    }
    const options = {};
    if (!useEnvWhatsApp) {
      options.token = empresa?.whatsapp_token || null;
      options.phoneId = empresa?.phone_number_id || null;
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
      try {
        const templateResult = await maybeSendReengagementTemplate({
          recipient: claimed.recipient,
          empresa,
          useEnvWhatsApp,
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
      } catch (templateErr) {
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
        err = templateErr;
      }
    }

    const classification = classifyOutboxError(err);
    const exhausted = Number(claimed.attempt_count || 0) >= maxAttempts;
    const terminalReason = exhausted
      ? "max_attempts_exceeded"
      : `permanent_error_${classification.errorCode}`;

    if (!classification.retryable || exhausted) {
      await OutboxMessage.markDead(claimed.id, err, {
        leaseToken: claimed.lease_token || null,
        errorClass: classification.errorClass,
        errorCode: classification.errorCode,
        terminalReason,
      });
    } else {
      await OutboxMessage.markFailed(claimed.id, err, {
        leaseToken: claimed.lease_token || null,
        backoffSeconds: calculateBackoffSeconds(claimed.attempt_count),
        errorClass: classification.errorClass,
        errorCode: classification.errorCode,
      });
    }

    logger.error("Falha ao enviar outbox_message", {
      outboxId: claimed.id,
      empresaId: claimed.empresa_id,
      contatoId: claimed.contato_id,
      to: maskPhone(claimed.recipient),
      message: err?.message || String(err),
      code: err?.code || null,
      whatsappReason: err?.whatsappReason || null,
      errorClass: classification.errorClass,
      errorCode: classification.errorCode,
      terminal: !classification.retryable || exhausted,
    });

    return {
      skipped: false,
      sent: false,
      failed: !classification.retryable || exhausted ? false : true,
      dead: !classification.retryable || exhausted,
    };
  }
}

async function processOutboxBatch({ limit = 20, leaseSeconds = 60 } = {}) {
  const maxAttempts = getMaxAttempts();
  const items = await OutboxMessage.listRetryable({ limit, maxAttempts });
  const summary = {
    scanned: items.length,
    claimed: 0,
    sent: 0,
    failed: 0,
    dead: 0,
  };

  for (const item of items) {
    const result = await deliverOutboxMessage(item, {
      leaseSeconds,
      maxAttempts,
    });
    if (result?.skipped) continue;
    summary.claimed += 1;
    if (result?.sent) summary.sent += 1;
    if (result?.failed) summary.failed += 1;
    if (result?.dead) summary.dead += 1;
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

  const result = await deliverOutboxMessage(reopened, {
    leaseSeconds,
    maxAttempts: getMaxAttempts(),
  });
  return { ...result, record: reopened };
}

module.exports = {
  deliverOutboxMessage,
  processOutboxBatch,
  retryOutboxMessageById,
  calculateBackoffSeconds,
  classifyOutboxError,
};
