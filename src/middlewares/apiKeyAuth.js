function unauthorized(res) {
  return res.status(401).json({ error: "Não autorizado" });
}

module.exports = function apiKeyAuth(options = {}) {
  const headerName = options.headerName || "x-api-key";

  return (req, res, next) => {
    const expected = String(process.env.ADMIN_API_KEY || "").trim();
    if (!expected) return next();

    const received = String(req.headers[headerName] || "").trim();
    if (!received || received !== expected) return unauthorized(res);

    return next();
  };
};
