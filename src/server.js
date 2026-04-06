require("dotenv").config();
const app = require("./app");
const logger = require("./utils/logger");
const env = require("./config/env");

const PORT = Number(process.env.PORT) || 3000;

process.on("uncaughtException", (err) => {
  logger.error("uncaughtException", {
    message: err?.message,
    stack: err?.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : undefined;
  logger.error("unhandledRejection", {
    message: error?.message ?? String(reason),
    stack: error?.stack,
  });
  process.exit(1);
});

try {
  env.validate();
} catch (err) {
  logger.error("Falha na validação de variáveis de ambiente", {
    message: err.message,
  });
  process.exit(1);
}

const server = app.listen(PORT, () => {
  logger.info("Server rodando", { port: PORT });
});

server.on("error", (err) => {
  logger.error("Erro ao iniciar listener HTTP", {
    code: err?.code,
    message: err?.message,
    stack: err?.stack,
  });
  process.exit(1);
});

const shutdown = (signal) => {
  logger.info("Encerrando servidor", { signal });

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
