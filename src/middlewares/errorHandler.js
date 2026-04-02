const logger = require("../utils/logger");

module.exports = (err, req, res, next) => {
  const status =
    Number.isFinite(err?.status) && err.status >= 400 && err.status < 600
      ? err.status
      : Number.isFinite(err?.statusCode) &&
          err.statusCode >= 400 &&
          err.statusCode < 600
        ? err.statusCode
        : 500;

  logger.error("Request error", {
    status,
    method: req.method,
    path: req.originalUrl,
    message: err?.message,
  });

  const isProd = process.env.NODE_ENV === "production";

  const payload = {
    error: status >= 500 ? "Erro interno" : err?.message || "Erro",
  };

  if (!isProd && err?.stack) payload.stack = err.stack;

  res.status(status).json(payload);
};
