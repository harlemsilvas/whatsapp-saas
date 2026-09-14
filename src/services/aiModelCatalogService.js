const axios = require("axios");
const AiModelCatalog = require("../models/AiModelCatalog");
const { decryptSecret } = require("../utils/credentialCrypto");
const { safeProviderError } = require("./aiCredentialService");

const SUPPORTED_PROVIDERS = new Set(["gemini", "nvidia", "openai"]);

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function uniqueModels(models) {
  return [...new Map(
    models.filter((model) => model.modelId).map((model) => [model.modelId, model]),
  ).values()];
}

function inferCapabilities(modelId, description = "") {
  const value = `${modelId} ${description}`.toLowerCase();
  const capabilities = [];
  const specialized =
    /embed|rerank|moderation|guard|tts|speech|audio|whisper|transcri|image|imagen|video|veo/.test(
      value,
    );
  if (/embed/.test(value)) capabilities.push("embeddings");
  if (/rerank/.test(value)) capabilities.push("reranking");
  if (/moderation|guard/.test(value)) capabilities.push("moderation");
  if (/tts|speech/.test(value)) capabilities.push("audio", "tts");
  if (/whisper|transcri/.test(value)) capabilities.push("audio", "transcription");
  if (/image|imagen/.test(value)) capabilities.push("image");
  if (/video|veo/.test(value)) capabilities.push("video");
  if (/vision|multimodal|(?:^|[-_/])vl(?:[-_/]|$)/.test(value)) {
    capabilities.push("vision");
  }
  if (/reason|deepseek-r1|(?:^|[-_/])o[134](?:[-_/]|$)/.test(value)) {
    capabilities.push("reasoning");
  }
  if (/code|coder|codestral/.test(value)) capabilities.push("code");
  if (
    !specialized &&
    /gemini|gpt|chat|instruct|llama|mistral|qwen|nemotron|deepseek|phi/.test(value)
  ) {
    capabilities.push("chat", "text");
  }
  return unique(capabilities);
}

function declaredGeminiCapabilities(methods = []) {
  const values = new Set(methods);
  const capabilities = [];
  if (values.has("generateContent") || values.has("streamGenerateContent")) {
    capabilities.push("chat", "text");
  }
  if (values.has("embedContent") || values.has("batchEmbedContents")) {
    capabilities.push("embeddings");
  }
  if (values.has("countTokens")) capabilities.push("token_counting");
  return unique(capabilities);
}

function endpointsForCapabilities(capabilities, provider) {
  const endpoints = [];
  if (capabilities.includes("chat")) {
    endpoints.push(provider === "gemini" ? "generateContent" : "chat.completions");
  }
  if (capabilities.includes("embeddings")) endpoints.push("embeddings");
  if (capabilities.includes("reranking")) endpoints.push("reranking");
  if (capabilities.includes("tts")) endpoints.push("audio.speech");
  if (capabilities.includes("transcription")) endpoints.push("audio.transcriptions");
  if (capabilities.includes("image")) endpoints.push("images");
  return unique(endpoints);
}

function normalizeGeminiModel(raw) {
  const modelId = String(raw.name || raw.baseModelId || "").replace(/^models\//, "");
  const methods = Array.isArray(raw.supportedGenerationMethods)
    ? raw.supportedGenerationMethods
    : [];
  const declaredCapabilities = declaredGeminiCapabilities(methods);
  const inferredCapabilities = inferCapabilities(modelId, raw.description)
    .filter((capability) => !declaredCapabilities.includes(capability));
  const capabilities = unique([...declaredCapabilities, ...inferredCapabilities]);
  return {
    modelId,
    displayName: raw.displayName || modelId,
    description: raw.description || null,
    ownedBy: "google",
    capabilities,
    declaredCapabilities,
    inferredCapabilities,
    endpoints: endpointsForCapabilities(capabilities, "gemini"),
    inputTokenLimit: Number(raw.inputTokenLimit) || null,
    outputTokenLimit: Number(raw.outputTokenLimit) || null,
    contextWindow: Number(raw.inputTokenLimit) || null,
    chatCompatible: declaredCapabilities.includes("chat"),
    metadataSource: "gemini_models_list",
    rawMetadata: {
      name: raw.name || null,
      version: raw.version || null,
      supportedGenerationMethods: methods,
    },
  };
}

function normalizeOpenAiModel(raw, provider) {
  const modelId = String(raw.id || raw.model || raw.root || "").trim();
  const inferredCapabilities = inferCapabilities(
    modelId,
    raw.description || raw.name || "",
  );
  const declaredCapabilities = [];
  const capabilities = unique(inferredCapabilities);
  return {
    modelId,
    displayName: raw.name || modelId,
    description: raw.description || null,
    ownedBy: raw.owned_by || raw.ownedBy || null,
    capabilities,
    declaredCapabilities,
    inferredCapabilities,
    endpoints: endpointsForCapabilities(capabilities, provider),
    inputTokenLimit: Number(raw.input_token_limit) || null,
    outputTokenLimit: Number(raw.output_token_limit) || null,
    contextWindow: Number(raw.max_model_len || raw.context_window) || null,
    chatCompatible: capabilities.includes("chat"),
    metadataSource: `${provider}_models_list`,
    rawMetadata: {
      object: raw.object || null,
      created: raw.created || null,
      root: raw.root || null,
      parent: raw.parent || null,
    },
  };
}

async function fetchGeminiModels(apiKey, timeoutMs) {
  const models = [];
  let pageToken = null;
  do {
    const response = await axios.get(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        params: { key: apiKey, pageSize: 1000, ...(pageToken ? { pageToken } : {}) },
        timeout: timeoutMs,
      },
    );
    models.push(...(response.data?.models || []).map(normalizeGeminiModel));
    pageToken = response.data?.nextPageToken || null;
  } while (pageToken);
  return uniqueModels(models);
}

async function fetchOpenAiCompatibleModels(credential, apiKey, timeoutMs) {
  const baseUrl = String(credential.base_url || "").replace(/\/$/, "");
  const response = await axios.get(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: timeoutMs,
  });
  return uniqueModels((response.data?.data || response.data?.models || [])
    .map((raw) => normalizeOpenAiModel(raw, credential.provider))
    .filter((model) => model.modelId));
}

async function fetchCredentialModels(credential, timeoutMs = 15000) {
  const apiKey = decryptSecret({
    ciphertext: credential.api_key_ciphertext,
    iv: credential.api_key_iv,
    authTag: credential.api_key_auth_tag,
  });
  if (credential.provider === "gemini") {
    return fetchGeminiModels(apiKey, timeoutMs);
  }
  return fetchOpenAiCompatibleModels(credential, apiKey, timeoutMs);
}

async function syncCredential(credential, { dryRun = false, timeoutMs = 15000 } = {}) {
  let run = null;
  try {
    if (!dryRun) {
      run = await AiModelCatalog.createRun({
        empresaId: credential.empresa_id,
        credentialId: credential.id,
        provider: credential.provider,
        dryRun,
      });
    }
    const models = await fetchCredentialModels(credential, timeoutMs);
    const persisted = dryRun
      ? { available: models.length, unavailable: 0 }
      : await AiModelCatalog.syncCredential(credential, models);
    const summary = {
      credentialId: credential.id,
      empresaId: credential.empresa_id,
      provider: credential.provider,
      discovered: models.length,
      ...persisted,
      models: models.map(({ rawMetadata: _rawMetadata, ...model }) => model),
    };
    if (run) await AiModelCatalog.finishRun(run.id, "completed", summary);
    return summary;
  } catch (err) {
    const detail = safeProviderError(err, credential.provider);
    if (run) {
      await AiModelCatalog.finishRun(run.id, "failed", {
        errorCode: detail.code,
        errorMessage: detail.message,
      }).catch(() => {});
    }
    const safeError = new Error(detail.message);
    safeError.provider = credential.provider;
    safeError.status = detail.status;
    safeError.code = detail.code;
    throw safeError;
  }
}

async function runModelCatalogSync({
  empresaId = null,
  credentialId = null,
  provider = null,
  dryRun = false,
  timeoutMs = 15000,
} = {}) {
  if (provider && !SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(`Provedor não suportado: ${provider}`);
  }
  const client = await AiModelCatalog.db.connect();
  let locked = false;
  try {
    locked = await AiModelCatalog.tryLock(client);
    if (!locked) return { skipped: true, reason: "already_running", results: [] };
    let credentials = await AiModelCatalog.listCredentials({ empresaId, credentialId });
    if (provider) {
      credentials = credentials.filter((item) => item.provider === provider);
    }
    const results = [];
    for (const credential of credentials) {
      try {
        results.push(await syncCredential(credential, { dryRun, timeoutMs }));
      } catch (err) {
        results.push({
          credentialId: credential.id,
          empresaId: credential.empresa_id,
          provider: credential.provider,
          error: { code: err.code || "catalog_error", message: err.message },
        });
      }
    }
    return {
      dry_run: dryRun,
      credentials: credentials.length,
      succeeded: results.filter((item) => !item.error).length,
      failed: results.filter((item) => item.error).length,
      results,
    };
  } finally {
    if (locked) await AiModelCatalog.unlock(client).catch(() => {});
    client.release();
  }
}

module.exports = {
  declaredGeminiCapabilities,
  fetchCredentialModels,
  inferCapabilities,
  normalizeGeminiModel,
  normalizeOpenAiModel,
  runModelCatalogSync,
  syncCredential,
};
