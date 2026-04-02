require("dotenv").config();
const app = require("./app");
const logger = require("./utils/logger");
const env = require("./config/env");

const PORT = process.env.PORT || 3000;

try {
  env.validate();
} catch (err) {
  logger.error("Falha na validação de variáveis de ambiente", {
    message: err.message,
  });
  process.exit(1);
}

app.listen(PORT, () => {
  logger.info("Server rodando", { port: PORT });
});
