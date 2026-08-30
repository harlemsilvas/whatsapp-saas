const crypto = require("crypto");
const env = require("../config/env");

function unauthorized(res) {
  return res.status(401).json({ error: "Não autorizado" });
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

  return (req, res, next) => {
    const expected = String(process.env.ADMIN_API_KEY || "").trim();
    if (!expected) {
      if (requireApiKey) return unauthorized(res);
      return next();
    }

    const received = String(req.headers[headerName] || "").trim();
    if (received && safeEqual(received, expected)) return next();

    if (queryParamName) {
      const receivedFromQuery = String(
        req.query?.[queryParamName] || "",
      ).trim();
      if (receivedFromQuery && safeEqual(receivedFromQuery, expected)) {
        return next();
      }
    }

    return unauthorized(res);
  };
};
