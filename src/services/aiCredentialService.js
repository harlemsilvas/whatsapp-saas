const axios = require("axios");
const AiProviderCredential = require("../models/AiProviderCredential");
const logger = require("../utils/logger");
const {
  decryptSecret,
  encryptSecret,
  fingerprintSecret,
} = require("../utils/credentialCrypto");

const PROVIDERS = Object.freeze({
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.5-flash-lite",
    apiStyle: "chat",
    priority: 10,
  },
  nvidia: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    apiStyle: "chat",
    priority: 20,
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiStyle: "responses",
    priority: 30,
  },
});

const DEFAULT_BASE_URL = PROVIDERS.openai.baseUrl;

function getProviderDefaults(provider) {
  return PROVIDERS[String(provider || "").trim().toLowerCase()] || null;
}

function normalizeConfig(input = {}) {
  const provider = String(input.provider || "openai").trim().toLowerCase();
  const defaults = getProviderDefaults(provider);
  if (!defaults) throw new Error("Provedor deve ser gemini, nvidia ou openai");

  const model = String(input.model || defaults.model).trim();
  const apiStyle = String(input.apiStyle || input.api_style || defaults.apiStyle)
    .trim()
    .toLowerCase();
  const baseUrl = String(input.baseUrl || input.base_url || defaults.baseUrl)
    .trim()
    .replace(/\/+$/, "");

  if (!model) throw new Error("Modelo de IA obrigatório");
  if (!["responses", "chat"].includes(apiStyle)) {
    throw new Error("API style deve ser responses ou chat");
  }
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error("Base URL da IA deve usar HTTPS");
  }
  if (provider !== "openai" && baseUrl !== defaults.baseUrl) {
    throw new Error(`Base URL não permitida para ${provider}`);
  }
  if (provider !== "openai" && apiStyle !== "chat") {
    throw new Error("Gemini e NVIDIA devem usar Chat Completions");
  }
  return { provider, model, apiStyle, baseUrl };
}

function providerHeaders(provider, apiKey) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (provider === "gemini") {
    headers["x-goog-api-client"] = "hdev-whatsapp-saas/1.0";
  }
  return headers;
}

function environmentConfigs() {
  return [
    {
      provider: "gemini",
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL,
      apiStyle: "chat",
    },
    {
      provider: "nvidia",
      apiKey: process.env.NVIDIA_API_KEY,
      model: process.env.NVIDIA_MODEL,
      apiStyle: "chat",
    },
    {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL,
      apiStyle: process.env.OPENAI_API_STYLE,
      baseUrl: process.env.OPENAI_BASE_URL,
    },
  ];
}

function listEnvironmentFallbacks() {
  return environmentConfigs().map((item) => {
    const config = normalizeConfig(item);
    return {
      provider: config.provider,
      configured: Boolean(String(item.apiKey || "").trim()),
      model: config.model,
      api_style: config.apiStyle,
      priority: getProviderDefaults(config.provider).priority,
    };
  });
}

function safeProviderError(err, provider = "") {
  const responseData = err?.response?.data;
  const responseError = Array.isArray(responseData)
    ? responseData[0]?.error
    : responseData?.error;
  const status = Number(err?.response?.status) || null;
  const providerCode = responseError?.code || null;
  const providerType = responseError?.type || null;
  let message =
    responseError?.message || responseData?.detail || err?.message || "Erro desconhecido";
  if (
    provider === "gemini" &&
    (status === 404 || /model.*not found/i.test(String(message)))
  ) {
    message =
      "Modelo Gemini não disponível para esta chave. Use gemini-3.5-flash-lite ou gemini-3.6-flash.";
  }
  return {
    status,
    code: String(providerCode || providerType || status || "network_error"),
    message: String(message).slice(0, 500),
  };
}

async function validateCredential({
  apiKey,
  provider,
  model,
  apiStyle,
  baseUrl,
  timeoutMs = 15000,
}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Chave da IA obrigatória");
  const config = normalizeConfig({ provider, model, apiStyle, baseUrl });
  if (["gemini", "nvidia"].includes(config.provider)) {
    await axios.post(
      `${config.baseUrl}/chat/completions`,
      {
        model: config.model,
        messages: [{ role: "user", content: "Responda apenas OK" }],
        max_tokens: 8,
      },
      {
        headers: {
          ...providerHeaders(config.provider, key),
          "Content-Type": "application/json",
        },
        timeout: timeoutMs,
      },
    );
  } else {
    await axios.get(
      `${config.baseUrl}/models/${encodeURIComponent(config.model)}`,
      {
        headers: providerHeaders(config.provider, key),
        timeout: timeoutMs,
      },
    );
  }
  return {
    ok: true,
    provider: config.provider,
    model: config.model,
  };
}

async function listRuntimeCandidates(empresaId) {
  let records = [];
  if (empresaId) {
    try {
      records = await AiProviderCredential.listUsable(empresaId);
    } catch (err) {
      logger.error("Falha ao carregar credenciais de IA do banco", {
        empresaId,
        message: err?.message || String(err),
      });
    }
  }
  const candidates = [];
  const fingerprints = new Set();

  for (const record of records) {
    try {
      const apiKey = decryptSecret({
        ciphertext: record.api_key_ciphertext,
        iv: record.api_key_iv,
        authTag: record.api_key_auth_tag,
      });
      fingerprints.add(`${record.provider}:${record.key_fingerprint}`);
      candidates.push({
        source: "database",
        credentialId: record.id,
        empresaId: record.empresa_id,
        fingerprint: record.key_fingerprint,
        status: record.status,
        priority: record.priority,
        apiKey,
        ...normalizeConfig(record),
      });
    } catch (err) {
      logger.error("Falha ao descriptografar credencial de IA", {
        empresaId,
        credentialId: record.id,
        fingerprint: record.key_fingerprint,
        message: err?.message || String(err),
      });
    }
  }

  for (const envConfig of environmentConfigs()) {
    const envKey = String(envConfig.apiKey || "").trim();
    if (!envKey) continue;
    const config = normalizeConfig(envConfig);
    const fingerprint = fingerprintSecret(envKey);
    if (!fingerprints.has(`${config.provider}:${fingerprint}`)) {
      const defaults = getProviderDefaults(config.provider);
      candidates.push({
        source: "environment",
        credentialId: null,
        empresaId,
        fingerprint,
        status: "valid",
        priority: defaults.priority,
        apiKey: envKey,
        ...config,
      });
    }
  }

  return candidates.sort((a, b) => {
    const priorityDiff = Number(a.priority) - Number(b.priority);
    if (priorityDiff) return priorityDiff;
    const sourceDiff = Number(a.source === "environment") - Number(b.source === "environment");
    if (sourceDiff) return sourceDiff;
    return Number(a.credentialId || 0) - Number(b.credentialId || 0);
  });
}

async function markSuccess(candidate) {
  if (candidate?.source !== "database" || candidate.status === "valid") return;
  await AiProviderCredential.markValid(
    candidate.empresaId,
    candidate.credentialId,
  );
}

async function markFailure(candidate, err) {
  const detail = safeProviderError(err, candidate?.provider);
  if (candidate?.source !== "database") return detail;

  const authFailure = [401, 403].includes(detail.status);
  const configFailure = [400, 404].includes(detail.status);
  const cooldownSeconds = detail.status === 429 ? 300 : 60;
  await AiProviderCredential.markFailure(
    candidate.empresaId,
    candidate.credentialId,
    {
      status: authFailure || configFailure ? "invalid" : "cooldown",
      errorCode: detail.code,
      errorMessage: detail.message,
      cooldownSeconds,
    },
  );
  return detail;
}

function shouldTryNext(err) {
  const status = Number(err?.response?.status) || null;
  return !status || [400, 401, 403, 404, 429].includes(status) || status >= 500;
}

module.exports = {
  DEFAULT_BASE_URL,
  PROVIDERS,
  encryptSecret,
  getProviderDefaults,
  listRuntimeCandidates,
  listEnvironmentFallbacks,
  markFailure,
  markSuccess,
  normalizeConfig,
  providerHeaders,
  safeProviderError,
  shouldTryNext,
  validateCredential,
};
