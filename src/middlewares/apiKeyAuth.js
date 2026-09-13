const crypto = require("crypto");
const env = require("../config/env");
const {
  empresaIdFromRequest,
  registerAudit,
} = require("../services/adminAuditService");

function unauthorized(res) {
  return res.status(401).json({ error: "Não autorizado" });
}

function forbidden(res) {
  return res.status(403).json({ error: "Acesso não permitido para esta empresa" });
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = function apiKeyAuth(options = {}) {
  const headerName = options.headerName || "x-api-key";
  const queryParamName = options.queryParamName || null;
  const isProd = process.env.NODE_ENV === "production";
  const requireApiKey = env.toBool(process.env.REQUIRE_ADMIN_API_KEY, isProd);

  return async (req, res, next) => {
    const expected = String(process.env.ADMIN_API_KEY || "").trim();
    if (!expected) {
      if (requireApiKey) {
        const receivedWithoutEnv = String(
          req.headers?.[headerName] ||
            (queryParamName ? req.query?.[queryParamName] : "") ||
            "",
        ).trim();
        if (!receivedWithoutEnv) return unauthorized(res);
      } else {
        req.adminActor = {
          type: "development",
          label: "development-bypass",
          permissions: ["superadmin", "read", "write", "manage_keys"],
        };
        registerAudit(req, res);
        return next();
      }
    }

    let received = String(req.headers?.[headerName] || "").trim();

    if (!received && queryParamName) {
      received = String(req.query?.[queryParamName] || "").trim();
    }

    if (!received) return unauthorized(res);

    if (expected && safeEqual(received, expected)) {
      req.adminActor = {
        type: "env_api_key",
        label: "ADMIN_API_KEY",
        permissions: ["superadmin", "read", "write", "manage_keys"],
      };
      registerAudit(req, res);
      return next();
    }

    const keyHash = crypto.createHash("sha256").update(received).digest("hex");
    const AdminApiKey = require("../models/AdminApiKey");
    const stored = await AdminApiKey.findUsableByHash(keyHash);
    if (!stored) return unauthorized(res);

    const permissions = Array.isArray(stored.permissions)
      ? stored.permissions
      : [];
    req.adminActor = {
      type: "tenant_api_key",
      id: stored.id,
      label: stored.label,
      empresaId: stored.empresa_id,
      permissions,
    };
    registerAudit(req, res);

    const requiredPermission = req.method === "GET" ? "read" : "write";
    if (
      !permissions.includes("superadmin") &&
      !permissions.includes(requiredPermission)
    ) {
      return forbidden(res);
    }

    const requestedEmpresaId = empresaIdFromRequest(req);
    if (
      !permissions.includes("superadmin") &&
      ((!requestedEmpresaId && !options.allowUnscopedTenant) ||
        (requestedEmpresaId &&
          Number(stored.empresa_id) !== requestedEmpresaId))
    ) {
      return forbidden(res);
    }

    AdminApiKey.touchLastUsed(stored.id).catch(() => {});
    return next();
  };
};
