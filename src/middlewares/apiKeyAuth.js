function unauthorized(res) {
  return res.status(401).json({ error: "Não autorizado" });
}

module.exports = function apiKeyAuth(options = {}) {
  const headerName = options.headerName || "x-api-key";
  const queryParamName = options.queryParamName || null;

  return (req, res, next) => {
    const expected = String(process.env.ADMIN_API_KEY || "").trim();
    if (!expected) return next();

    const received = String(req.headers[headerName] || "").trim();
    if (received && received === expected) return next();

    if (queryParamName) {
      const receivedFromQuery = String(
        req.query?.[queryParamName] || "",
      ).trim();
      if (receivedFromQuery && receivedFromQuery === expected) return next();
    }

    return unauthorized(res);
  };
};
