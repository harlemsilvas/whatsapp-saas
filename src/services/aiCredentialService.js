const axios = require("axios");
const AiProviderCredential = require("../models/AiProviderCredential");
const logger = require("../utils/logger");
const {
  decryptSecret,
  encryptSecret,
  fingerprintSecret,
} = require("../utils/credentialCrypto");

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

function normalizeConfig(input = {}) {
  const provider = String(input.provider || "openai").trim().toLowerCase();
  const model = String(input.model || "gpt-4o-mini").trim();
  const apiStyle = String(input.apiStyle || input.api_style || "responses")
    .trim()
    .toLowerCase();
  const baseUrl = String(input.baseUrl || input.base_url || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, "");

  if (provider !== "openai") throw new Error("Provedor ainda não suportado");
  if (!model) throw new Error("Modelo de IA obrigatório");
  if (!["responses", "chat"].includes(apiStyle)) {
    throw new Error("API style deve ser responses ou chat");
  }
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error("Base URL da IA deve usar HTTPS");
  }
  return { provider, model, apiStyle, baseUrl };
}

function safeProviderError(err) {
  const status = Number(err?.response?.status) || null;
  const providerCode = err?.response?.data?.error?.code || null;
  const providerType = err?.response?.data?.error?.type || null;
  const message =
    err?.response?.data?.error?.message || err?.message || "Erro desconhecido";
  return {
    status,
    code: String(providerCode || providerType || status || "network_error"),
    message: String(message).slice(0, 500),
  };
}

async function validateCredential({ apiKey, model, baseUrl, timeoutMs = 15000 }) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Chave da IA obrigatória");
  const config = normalizeConfig({ model, baseUrl });
  const url = `${config.baseUrl}/models/${encodeURIComponent(config.model)}`;
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${key}` },
    timeout: timeoutMs,
  });
  return {
    ok: true,
    provider: "openai",
    model: response.data?.id || config.model,
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
      fingerprints.add(record.key_fingerprint);
      candidates.push({
        source: "database",
        credentialId: record.id,
        empresaId: record.empresa_id,
        fingerprint: record.key_fingerprint,
        status: record.status,
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

  const envKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (envKey) {
    const fingerprint = fingerprintSecret(envKey);
    if (!fingerprints.has(fingerprint)) {
      candidates.push({
        source: "environment",
        credentialId: null,
        empresaId,
        fingerprint,
        apiKey: envKey,
        ...normalizeConfig({
          provider: "openai",
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          apiStyle: process.env.OPENAI_API_STYLE || "responses",
          baseUrl: process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL,
        }),
      });
    }
  }

  return candidates;
}

async function markSuccess(candidate) {
  if (candidate?.source !== "database" || candidate.status === "valid") return;
  await AiProviderCredential.markValid(
    candidate.empresaId,
    candidate.credentialId,
  );
}

async function markFailure(candidate, err) {
  const detail = safeProviderError(err);
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
  return !status || [401, 403, 429].includes(status) || status >= 500;
}

module.exports = {
  DEFAULT_BASE_URL,
  encryptSecret,
  listRuntimeCandidates,
  markFailure,
  markSuccess,
  normalizeConfig,
  safeProviderError,
  shouldTryNext,
  validateCredential,
};
