const Empresa = require("../models/Empresa");
const AiModelCatalog = require("../models/AiModelCatalog");
const { runModelCatalogSync } = require("../services/aiModelCatalogService");

const SUPPORTED_PROVIDERS = new Set(["gemini", "nvidia", "openai"]);

function toInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function toBool(value, fallback = null) {
  if (value === undefined) return fallback;
  if ([true, "true", "1"].includes(value)) return true;
  if ([false, "false", "0"].includes(value)) return false;
  return fallback;
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
    const provider = req.query?.provider
      ? String(req.query.provider).trim().toLowerCase()
      : null;
    if (provider && !SUPPORTED_PROVIDERS.has(provider)) {
      return res.status(400).json({ error: "Provedor inválido" });
    }
    const items = await AiModelCatalog.listPublic(context.empresaId, {
      credentialId: toInt(req.query?.credentialId),
      provider,
      available: toBool(req.query?.available, true),
      chatCompatible: toBool(req.query?.chatCompatible, null),
    });
    return res.json({ empresa: { id: context.empresaId }, items });
  } catch (err) {
    next(err);
  }
};

exports.sincronizar = async (req, res, next) => {
  try {
    const context = await requireEmpresa(req, res);
    if (!context) return;
    const credentialId = toInt(req.params.credentialId);
    if (!credentialId) {
      return res.status(400).json({ error: "credentialId inválido" });
    }
    const result = await runModelCatalogSync({
      empresaId: context.empresaId,
      credentialId,
      dryRun: req.body?.dry_run === true,
      timeoutMs: 15000,
    });
    if (result.skipped) {
      return res.status(409).json({
        error: "Uma sincronização do catálogo já está em andamento",
        reason: result.reason,
      });
    }
    if (!result.credentials) {
      return res.status(404).json({ error: "Credencial habilitada não encontrada" });
    }
    if (result.failed) {
      return res.status(502).json({
        error: "Falha ao sincronizar catálogo no provedor",
        result: {
          ...result,
          results: result.results.map(({ models: _models, ...item }) => item),
        },
      });
    }
    return res.json({
      ok: true,
      result: {
        ...result,
        results: result.results.map(({ models: _models, ...item }) => item),
      },
    });
  } catch (err) {
    next(err);
  }
};
