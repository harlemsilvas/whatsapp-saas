const env = require("./env");

function parseAllowedOrigins(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin, allowedOrigins) {
  return allowedOrigins.includes(String(origin || "").trim());
}

function buildCorsOptions() {
  const isProd = process.env.NODE_ENV === "production";
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const allowNoOrigin = env.toBool(process.env.CORS_ALLOW_NO_ORIGIN, true);
  const allowCredentials = env.toBool(
    process.env.CORS_ALLOW_CREDENTIALS,
    false,
  );

  return {
    credentials: allowCredentials,
    origin(origin, callback) {
      if (!origin) {
        return callback(null, allowNoOrigin);
      }

      if (!allowedOrigins.length && !isProd) {
        return callback(null, true);
      }

      if (isOriginAllowed(origin, allowedOrigins)) {
        return callback(null, true);
      }

      const err = new Error("CORS origin não permitida");
      err.status = 403;
      return callback(err);
    },
  };
}

module.exports = {
  buildCorsOptions,
  isOriginAllowed,
  parseAllowedOrigins,
};
