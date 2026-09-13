const logger = require("../utils/logger");

function empresaIdFromRequest(req) {
  const direct = Number(req.params?.empresaId || req.params?.id || 0);
  if (direct > 0) return Math.trunc(direct);
  const match = String(req.originalUrl || req.url || "").match(
    /\/empresas\/(\d+)/,
  );
  return match ? Number(match[1]) : null;
}

function registerAudit(req, res) {
  if (typeof res.on !== "function") return;

  res.on("finish", () => {
    if (!req.adminActor) return;
    const accessDenied = res.statusCode === 403;
    if (req.method === "GET" && !accessDenied) return;
    if (res.statusCode >= 400 && !accessDenied) return;
    const AdminAuditLog = require("../models/AdminAuditLog");
    const requestedEmpresaId = empresaIdFromRequest(req);
    const empresaId =
      accessDenied && req.adminActor.empresaId
        ? Number(req.adminActor.empresaId)
        : requestedEmpresaId;
    const path = String(req.route?.path || req.path || "unknown").slice(0, 100);
    AdminAuditLog.create({
      empresaId,
      actorType: req.adminActor.type,
      actorId: req.adminActor.id || null,
      actorLabel: req.adminActor.label || null,
      action: `${req.method} ${path}`.slice(0, 100),
      resourceType: "admin_api",
      resourceId: String(
        req.params?.credentialId ||
          req.params?.outboxId ||
          req.params?.contatoId ||
          req.params?.id ||
          "",
      ).slice(0, 100) || null,
      requestId: String(req.get?.("x-request-id") || "").slice(0, 100) || null,
      metadata: {
        status: res.statusCode,
        access_denied: accessDenied,
        ...(accessDenied ? { requested_empresa_id: requestedEmpresaId } : null),
      },
    }).catch((err) => {
      logger.error("Falha ao registrar auditoria administrativa", {
        message: err?.message || String(err),
        empresaId,
      });
    });
  });
}

module.exports = { empresaIdFromRequest, registerAudit };
