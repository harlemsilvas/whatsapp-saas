const axios = require("axios");
const AiProviderCredential = require("../models/AiProviderCredential");
const CredentialHealth = require("../models/CredentialHealth");
const logger = require("../utils/logger");
const { decryptSecret } = require("../utils/credentialCrypto");
const {
  safeProviderError,
  validateCredential,
} = require("./aiCredentialService");

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function healthOptions(overrides = {}) {
  return {
    dryRun: Boolean(overrides.dryRun),
    timeoutMs: positiveInt(
      overrides.timeoutMs ?? process.env.CREDENTIAL_HEALTH_TIMEOUT_MS,
      15000,
    ),
    concurrency: Math.min(
      10,
      positiveInt(
        overrides.concurrency ?? process.env.CREDENTIAL_HEALTH_CONCURRENCY,
        2,
      ),
    ),
    failureThreshold: Math.max(
      2,
      positiveInt(
        overrides.failureThreshold ??
          process.env.CREDENTIAL_HEALTH_FAILURE_THRESHOLD,
        2,
      ),
    ),
    alertMilestones: String(
      overrides.alertMilestones ??
        process.env.CREDENTIAL_HEALTH_ALERT_DAYS ??
        "30,15,7,3,1",
    )
      .split(",")
      .map((item) => positiveInt(item.trim(), 0))
      .filter(Boolean)
      .sort((a, b) => b - a),
    alertWebhookUrl: String(
      overrides.alertWebhookUrl ??
        process.env.CREDENTIAL_HEALTH_ALERT_WEBHOOK_URL ??
        "",
    ).trim(),
  };
}

function classifyFailure(err, provider = "") {
  const detail = safeProviderError(err, provider);
  if ([401, 403].includes(detail.status)) {
    return { kind: "auth", definitive: true, ...detail };
  }
  if ([400, 404].includes(detail.status)) {
    return { kind: "configuration", definitive: true, ...detail };
  }
  if (detail.status === 429) {
    return { kind: "rate_limit", definitive: false, ...detail };
  }
  return { kind: "transient", definitive: false, ...detail };
}

function expirationMilestone(expiresAt, milestones, now = new Date()) {
  if (!expiresAt) return null;
  const remainingMs = new Date(expiresAt).getTime() - now.getTime();
  if (!Number.isFinite(remainingMs)) return null;
  const days = Math.ceil(remainingMs / 86400000);
  if (days <= 0) return { code: "expired", days };
  const milestone = [...milestones].reverse().find((item) => days <= item);
  return milestone ? { code: `expires_${milestone}d`, days, milestone } : null;
}

async function notifyWebhook(url, payload, timeoutMs) {
  if (!url) return false;
  await axios.post(url, payload, {
    timeout: timeoutMs,
    headers: { "Content-Type": "application/json" },
  });
  return true;
}

function safeAlertPayload(alert, event = "credential_alert") {
  return {
    event,
    empresa_id: alert.empresa_id || alert.empresaId,
    credential_type: alert.credential_type || alert.credentialType,
    provider: alert.provider,
    alert_code: alert.alert_code || alert.alertCode,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    detected_at: alert.last_detected_at || new Date().toISOString(),
  };
}

async function activateAlert(alert, options) {
  if (options.dryRun) return { ...alert, dry_run: true };
  const saved = await CredentialHealth.upsertAlert(alert);
  if (!saved.last_notified_at && options.alertWebhookUrl) {
    try {
      await notifyWebhook(
        options.alertWebhookUrl,
        safeAlertPayload(saved),
        options.timeoutMs,
      );
      await CredentialHealth.markAlertNotified(saved.id);
    } catch (err) {
      logger.error("Falha ao enviar webhook de saúde de credencial", {
        alertId: saved.id,
        empresaId: saved.empresa_id,
        message: err?.message || String(err),
      });
    }
  }
  return saved;
}

async function resolveAlerts(scope, options, provider) {
  if (options.dryRun) return [];
  const resolved = await CredentialHealth.resolveAlerts(scope);
  if (resolved.length && options.alertWebhookUrl) {
    try {
      await notifyWebhook(
        options.alertWebhookUrl,
        safeAlertPayload(
          {
            empresaId: scope.empresaId,
            credentialType: scope.credentialType,
            provider,
            alertCode: "recovered",
            severity: "info",
            title: "Credencial recuperada",
            message: `${resolved.length} alerta(s) anterior(es) foram resolvidos.`,
          },
          "credential_recovered",
        ),
        options.timeoutMs,
      );
    } catch (err) {
      logger.error("Falha ao enviar recuperação de credencial", {
        empresaId: scope.empresaId,
        message: err?.message || String(err),
      });
    }
  }
  return resolved;
}

async function discoverMetaExpiration(record, token, options) {
  const appId = String(process.env.META_APP_ID || "").trim();
  const appSecret = String(process.env.WHATSAPP_APP_SECRET || "").trim();
  if (!appId || !appSecret) {
    return {
      expiresAt: record.whatsapp_token_expires_at,
      source: record.whatsapp_token_expiry_source,
    };
  }
  const baseUrl = String(process.env.WHATSAPP_URL || "").replace(/\/$/, "");
  const response = await axios.get(`${baseUrl}/debug_token`, {
    params: { input_token: token, access_token: `${appId}|${appSecret}` },
    timeout: options.timeoutMs,
  });
  const expires = Number(response.data?.data?.expires_at || 0);
  return {
    expiresAt: expires > 0 ? new Date(expires * 1000).toISOString() : null,
    source: expires > 0 ? "meta_debug_token" : "meta_debug_token_permanent",
  };
}

async function checkAiCredential(record, options) {
  const scope = {
    empresaId: record.empresa_id,
    credentialType: "ai",
    credentialId: record.id,
  };
  try {
    const apiKey = decryptSecret({
      ciphertext: record.api_key_ciphertext,
      iv: record.api_key_iv,
      authTag: record.api_key_auth_tag,
    });
    await validateCredential({
      apiKey,
      provider: record.provider,
      model: record.model,
      apiStyle: record.api_style,
      baseUrl: record.base_url,
      timeoutMs: options.timeoutMs,
    });
    if (!options.dryRun) {
      await AiProviderCredential.markValid(record.empresa_id, record.id);
    }
    await resolveAlerts(scope, options, record.provider);
    return { type: "ai", id: record.id, empresaId: record.empresa_id, status: "valid" };
  } catch (err) {
    const failure = classifyFailure(err, record.provider);
    const authFailureCount = Number(record.health_auth_failure_count || 0) + 1;
    const confirmedAuth = failure.kind === "auth" && authFailureCount >= options.failureThreshold;
    const configuration = failure.kind === "configuration";
    const invalid = confirmedAuth || configuration;
    if (!options.dryRun) {
      await AiProviderCredential.markHealthFailure(record.empresa_id, record.id, {
        status: invalid ? "invalid" : "cooldown",
        errorCode: failure.code,
        errorMessage: failure.message,
        cooldownSeconds: failure.kind === "rate_limit" ? 1800 : 300,
        disable: confirmedAuth,
        authFailure: failure.kind === "auth",
      });
    }
    if (invalid) {
      await activateAlert(
        {
          ...scope,
          provider: record.provider,
          alertCode: configuration ? "model_configuration_invalid" : "credential_invalid",
          severity: "critical",
          title: configuration ? "Modelo de IA incompatível" : "Credencial de IA inválida",
          message: `${record.label}: ${failure.message}`,
          metadata: { error_code: failure.code, model: record.model },
        },
        options,
      );
    }
    return {
      type: "ai",
      id: record.id,
      empresaId: record.empresa_id,
      status: invalid ? "invalid" : "warning",
      kind: failure.kind,
      code: failure.code,
    };
  }
}

async function checkWhatsappCredential(record, options) {
  const scope = {
    empresaId: record.id,
    credentialType: "whatsapp",
    credentialId: null,
  };
  try {
    const token = decryptSecret({
      ciphertext: record.whatsapp_token_ciphertext,
      iv: record.whatsapp_token_iv,
      authTag: record.whatsapp_token_auth_tag,
    });
    const baseUrl = String(process.env.WHATSAPP_URL || "").replace(/\/$/, "");
    await axios.get(`${baseUrl}/${record.phone_number_id}`, {
      params: { fields: "display_phone_number,verified_name" },
      headers: { Authorization: `Bearer ${token}` },
      timeout: options.timeoutMs,
    });
    let expiry = { expiresAt: record.whatsapp_token_expires_at, source: record.whatsapp_token_expiry_source };
    try {
      expiry = await discoverMetaExpiration(record, token, options);
    } catch (err) {
      logger.warn("Não foi possível consultar expiração do token Meta", {
        empresaId: record.id,
        code: safeProviderError(err, "meta").code,
      });
    }
    if (!options.dryRun) {
      await CredentialHealth.markWhatsappValid(record.id, expiry.expiresAt, expiry.source);
    }
    await resolveAlerts(
      {
        ...scope,
        alertCodes: ["credential_invalid", "whatsapp_configuration_invalid"],
      },
      options,
      "meta",
    );
    const milestone = expirationMilestone(expiry.expiresAt, options.alertMilestones);
    if (milestone) {
      if (!options.dryRun) {
        await CredentialHealth.resolveOtherExpirationAlerts(
          record.id,
          milestone.code,
        );
      }
      await activateAlert(
        {
          ...scope,
          provider: "meta",
          alertCode: milestone.code,
          severity: milestone.code === "expired" ? "critical" : "warning",
          title: milestone.code === "expired" ? "Token Meta expirado" : "Token Meta próximo da expiração",
          message: milestone.days > 0
            ? `O token da empresa expira em aproximadamente ${milestone.days} dia(s).`
            : "O token da empresa atingiu a data de expiração.",
          metadata: { expires_at: expiry.expiresAt, days_remaining: milestone.days },
        },
        options,
      );
      return { type: "whatsapp", empresaId: record.id, status: "warning" };
    }
    if (!options.dryRun) {
      await CredentialHealth.resolveOtherExpirationAlerts(record.id, null);
    }
    return { type: "whatsapp", empresaId: record.id, status: "valid" };
  } catch (err) {
    const failure = classifyFailure(err, "meta");
    const authFailureCount = Number(record.whatsapp_token_auth_failure_count || 0) + 1;
    const confirmed = failure.kind === "auth" && authFailureCount >= options.failureThreshold;
    const configuration = failure.kind === "configuration";
    const invalid = confirmed || configuration;
    if (!options.dryRun) {
      await CredentialHealth.markWhatsappFailure(record.id, {
        status: invalid ? "invalid" : "warning",
        errorCode: failure.code,
        errorMessage: failure.message,
        authFailure: failure.kind === "auth",
        disable: invalid,
      });
    }
    if (invalid) {
      await activateAlert(
        {
          ...scope,
          provider: "meta",
          alertCode: configuration ? "whatsapp_configuration_invalid" : "credential_invalid",
          severity: "critical",
          title: configuration ? "Configuração WhatsApp inválida" : "Token WhatsApp inválido ou expirado",
          message: failure.message,
          metadata: { error_code: failure.code },
        },
        options,
      );
    }
    return {
      type: "whatsapp",
      empresaId: record.id,
      status: invalid ? "invalid" : "warning",
      kind: failure.kind,
      code: failure.code,
    };
  }
}

async function mapConcurrent(items, limit, callback) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await callback(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

async function runCredentialHealth(overrides = {}) {
  const options = healthOptions(overrides);
  const client = await CredentialHealth.db.connect();
  let locked = false;
  let run = null;
  const summary = {
    dry_run: options.dryRun,
    checked: 0,
    valid: 0,
    warning: 0,
    invalid: 0,
    errors: 0,
    results: [],
  };
  try {
    locked = await CredentialHealth.tryLock(client);
    if (!locked) return { ...summary, skipped: true, reason: "already_running" };
    if (!options.dryRun) run = await CredentialHealth.createRun(false);
    const [ai, whatsapp] = await Promise.all([
      CredentialHealth.listAiCandidates(),
      CredentialHealth.listWhatsappCandidates(),
    ]);
    const tasks = [
      ...ai.map((record) => () => checkAiCredential(record, options)),
      ...whatsapp.map((record) => () => checkWhatsappCredential(record, options)),
    ];
    summary.results = await mapConcurrent(
      tasks,
      options.concurrency,
      async (task) => {
        try {
          return await task();
        } catch (err) {
          logger.error("Falha inesperada no health check", {
            message: err?.message || String(err),
          });
          return { status: "error", code: "internal_error" };
        }
      },
    );
    summary.checked = summary.results.length;
    for (const result of summary.results) {
      if (result.status === "valid") summary.valid += 1;
      else if (result.status === "warning") summary.warning += 1;
      else if (result.status === "invalid") summary.invalid += 1;
      else summary.errors += 1;
    }
    if (run) await CredentialHealth.finishRun(run.id, "completed", summary);
    return summary;
  } catch (err) {
    summary.errors += 1;
    if (run) await CredentialHealth.finishRun(run.id, "failed", summary).catch(() => {});
    throw err;
  } finally {
    if (locked) await CredentialHealth.unlock(client).catch(() => {});
    client.release();
  }
}

module.exports = {
  checkAiCredential,
  checkWhatsappCredential,
  classifyFailure,
  expirationMilestone,
  healthOptions,
  runCredentialHealth,
  safeAlertPayload,
};
