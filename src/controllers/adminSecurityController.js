const crypto = require("crypto");
const AdminApiKey = require("../models/AdminApiKey");
const AdminAuditLog = require("../models/AdminAuditLog");
const Empresa = require("../models/Empresa");

function toInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function canManageKeys(req) {
  const permissions = req.adminActor?.permissions || [];
  return (
    permissions.includes("superadmin") || permissions.includes("manage_keys")
  );
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

exports.listarChaves = async (req, res, next) => {
  try {
    const context = await requireEmpresa(req, res);
    if (!context) return;
    if (!canManageKeys(req)) {
      return res.status(403).json({ error: "Permissão manage_keys necessária" });
    }
    const items = await AdminApiKey.listByEmpresaId(context.empresaId);
    return res.json({ empresa: { id: context.empresaId }, items });
  } catch (err) {
    next(err);
  }
};

exports.criarChave = async (req, res, next) => {
  try {
    const context = await requireEmpresa(req, res);
    if (!context) return;
    if (!canManageKeys(req)) {
      return res.status(403).json({ error: "Permissão manage_keys necessária" });
    }

    const label = String(req.body?.label || "Administrador").trim();
    if (!label || label.length > 100) {
      return res.status(400).json({ error: "label inválido" });
    }
    const requested = Array.isArray(req.body?.permissions)
      ? req.body.permissions.map((item) => String(item).trim().toLowerCase())
      : ["read", "write"];
    const allowed = new Set(["read", "write", "manage_keys"]);
    const permissions = [...new Set(requested)];
    if (!permissions.length || permissions.some((item) => !allowed.has(item))) {
      return res.status(400).json({ error: "permissions inválidas" });
    }

    const expiresAt = req.body?.expires_at
      ? new Date(req.body.expires_at)
      : null;
    if (
      expiresAt &&
      (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())
    ) {
      return res.status(400).json({ error: "expires_at deve estar no futuro" });
    }

    const apiKey = `wsa_${crypto.randomBytes(32).toString("base64url")}`;
    const item = await AdminApiKey.create({
      empresaId: context.empresaId,
      label,
      keyHash: crypto.createHash("sha256").update(apiKey).digest("hex"),
      keyPrefix: apiKey.slice(0, 12),
      permissions,
      expiresAt: expiresAt?.toISOString() || null,
    });
    return res.status(201).json({
      ok: true,
      api_key: apiKey,
      warning: "Esta chave será exibida somente nesta resposta.",
      item,
    });
  } catch (err) {
    next(err);
  }
};

exports.revogarChave = async (req, res, next) => {
  try {
    const context = await requireEmpresa(req, res);
    if (!context) return;
    if (!canManageKeys(req)) {
      return res.status(403).json({ error: "Permissão manage_keys necessária" });
    }
    const keyId = toInt(req.params.keyId);
    if (!keyId) return res.status(400).json({ error: "keyId inválido" });

    const item = await AdminApiKey.revoke(context.empresaId, keyId);
    if (!item) return res.status(404).json({ error: "Chave não encontrada" });
    return res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
};

exports.listarAuditoria = async (req, res, next) => {
  try {
    const context = await requireEmpresa(req, res);
    if (!context) return;
    const limit = Math.min(200, Math.max(1, toInt(req.query?.limit) || 100));
    const offset = Math.max(0, toInt(req.query?.offset) || 0);
    const items = await AdminAuditLog.listByEmpresaId(context.empresaId, {
      limit,
      offset,
    });
    return res.json({ empresa: { id: context.empresaId }, items });
  } catch (err) {
    next(err);
  }
};
