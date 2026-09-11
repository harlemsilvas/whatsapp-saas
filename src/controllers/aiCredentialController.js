const Empresa = require("../models/Empresa");
const AiProviderCredential = require("../models/AiProviderCredential");
const {
  encryptSecret,
  getProviderDefaults,
  listEnvironmentFallbacks,
  normalizeConfig,
  safeProviderError,
  validateCredential,
} = require("../services/aiCredentialService");
const { decryptSecret } = require("../utils/credentialCrypto");

function toInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function parsePriority(value, fallback = 100) {
  const priority = toInt(value ?? fallback);
  if (!priority || priority < 1 || priority > 10000) {
    throw new Error("Prioridade deve estar entre 1 e 10000");
  }
  return priority;
}

function duplicateMessage(err) {
  const constraint = String(err?.constraint || "");
  return constraint.includes("fingerprint")
    ? "Esta chave já está cadastrada para a empresa"
    : "Já existe uma chave com esse nome";
}

function configOrBadRequest(input, res) {
  try {
    return normalizeConfig(input);
  } catch (err) {
    res.status(400).json({ error: err.message });
    return null;
  }
}

async function requireEmpresa(req, res) {
  const empresaId = toInt(req.params.id);
  if (!empresaId) {
    res.status(400).json({ error: "id inválido" });
    return null;
  }
  const empresa = await Empresa.findById(empresaId);
  if (!empresa) {
    res.status(404).json({ error: "Empresa não encontrada" });
    return null;
  }
  return { empresaId, empresa };
}

exports.listar = async (req, res, next) => {
  try {
    const context = await requireEmpresa(req, res);
    if (!context) return;
    const items = await AiProviderCredential.listPublic(context.empresaId);
    res.json({
      empresa: { id: context.empresa.id, nome: context.empresa.nome },
      items,
      env_fallbacks: listEnvironmentFallbacks(),
    });
  } catch (err) {
    next(err);
  }
};

exports.criar = async (req, res, next) => {
  try {
    const context = await requireEmpresa(req, res);
    if (!context) return;
    const apiKey = String(req.body?.api_key || "").trim();
    const label = String(req.body?.label || "Chave principal").trim();
    if (!apiKey) return res.status(400).json({ error: "api_key é obrigatória" });
    if (!label) return res.status(400).json({ error: "label é obrigatório" });

    const config = configOrBadRequest(req.body, res);
    if (!config) return;
    let verified;
    try {
      verified = await validateCredential({ apiKey, ...config });
    } catch (err) {
      return res.status(400).json({
        error: `Credencial rejeitada por ${config.provider}`,
        provider: safeProviderError(err, config.provider),
      });
    }

    const item = await AiProviderCredential.create({
      empresaId: context.empresaId,
      provider: config.provider,
      label,
      encrypted: encryptSecret(apiKey),
      model: config.model,
      apiStyle: config.apiStyle,
      baseUrl: config.baseUrl,
      priority: parsePriority(
        req.body?.priority,
        getProviderDefaults(config.provider).priority,
      ),
      enabled: req.body?.enabled !== false,
      status: "valid",
    });
    res.status(201).json({ ok: true, item, verified });
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: duplicateMessage(err) });
    }
    next(err);
  }
};

exports.atualizar = async (req, res, next) => {
  try {
    const context = await requireEmpresa(req, res);
    if (!context) return;
    const credentialId = toInt(req.params.credentialId);
    if (!credentialId) return res.status(400).json({ error: "credentialId inválido" });
    const current = await AiProviderCredential.findById(
      context.empresaId,
      credentialId,
    );
    if (!current) return res.status(404).json({ error: "Credencial não encontrada" });
    if (
      req.body?.provider &&
      String(req.body.provider).trim().toLowerCase() !== current.provider
    ) {
      return res.status(400).json({ error: "O provedor de uma chave existente não pode ser alterado" });
    }

    const apiKeyInput = String(req.body?.api_key || "").trim();
    const config = configOrBadRequest({ ...current, ...req.body }, res);
    if (!config) return;
    const configChanged = ["model", "api_style", "apiStyle", "base_url", "baseUrl"]
      .some((field) => req.body?.[field] !== undefined);
    const needsValidation = Boolean(
      apiKeyInput || configChanged || (req.body?.enabled === true && current.status !== "valid"),
    );

    if (needsValidation) {
      const apiKey = apiKeyInput || decryptSecret({
        ciphertext: current.api_key_ciphertext,
        iv: current.api_key_iv,
        authTag: current.api_key_auth_tag,
      });
      try {
        await validateCredential({ apiKey, ...config });
      } catch (err) {
        return res.status(400).json({
          error: `Credencial rejeitada por ${config.provider}`,
          provider: safeProviderError(err, config.provider),
        });
      }
    }

    let item = await AiProviderCredential.update(
      context.empresaId,
      credentialId,
      {
        label: req.body?.label ? String(req.body.label).trim() : null,
        encrypted: apiKeyInput ? encryptSecret(apiKeyInput) : null,
        model: config.model,
        apiStyle: config.apiStyle,
        baseUrl: config.baseUrl,
        priority:
          req.body?.priority === undefined
            ? null
            : parsePriority(req.body.priority),
        enabled:
          typeof req.body?.enabled === "boolean" ? req.body.enabled : null,
      },
    );
    if (needsValidation) {
      item = await AiProviderCredential.markValid(context.empresaId, credentialId);
    }
    res.json({ ok: true, item });
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: duplicateMessage(err) });
    }
    next(err);
  }
};

exports.verificar = async (req, res, next) => {
  try {
    const context = await requireEmpresa(req, res);
    if (!context) return;
    const credentialId = toInt(req.params.credentialId);
    const current = await AiProviderCredential.findById(
      context.empresaId,
      credentialId,
    );
    if (!current) return res.status(404).json({ error: "Credencial não encontrada" });

    const apiKey = decryptSecret({
      ciphertext: current.api_key_ciphertext,
      iv: current.api_key_iv,
      authTag: current.api_key_auth_tag,
    });
    try {
      const verified = await validateCredential({
        apiKey,
        provider: current.provider,
        model: current.model,
        apiStyle: current.api_style,
        baseUrl: current.base_url,
      });
      const item = await AiProviderCredential.markValid(
        context.empresaId,
        credentialId,
      );
      return res.json({ ok: true, item, verified });
    } catch (err) {
      const provider = safeProviderError(err, current.provider);
      const invalid = [400, 401, 403, 404].includes(provider.status);
      const item = await AiProviderCredential.markFailure(
        context.empresaId,
        credentialId,
        {
          status: invalid ? "invalid" : "cooldown",
          errorCode: provider.code,
          errorMessage: provider.message,
          cooldownSeconds: provider.status === 429 ? 300 : 60,
        },
      );
      return res.status(400).json({
        error: `Credencial rejeitada por ${current.provider}`,
        provider,
        item,
      });
    }
  } catch (err) {
    next(err);
  }
};

exports.remover = async (req, res, next) => {
  try {
    const context = await requireEmpresa(req, res);
    if (!context) return;
    const credentialId = toInt(req.params.credentialId);
    const removed = await AiProviderCredential.remove(
      context.empresaId,
      credentialId,
    );
    if (!removed) return res.status(404).json({ error: "Credencial não encontrada" });
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
};
