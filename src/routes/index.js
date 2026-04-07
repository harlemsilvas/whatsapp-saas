const router = require("express").Router();
const apiKeyAuth = require("../middlewares/apiKeyAuth");

router.use("/webhook", require("./webhookRoutes"));

// Admin inbox/painel
router.use("/admin", require("./adminRoutes"));

// Admin API (se ADMIN_API_KEY estiver definido, exige header x-api-key)
router.use("/empresas", apiKeyAuth());
router.use("/empresas", require("./empresaRoutes"));

// Recursos multi-tenant (sempre dentro de uma empresa)
router.use("/empresas/:empresaId/contatos", apiKeyAuth());
router.use("/empresas/:empresaId/contatos", require("./contatoRoutes"));

router.use("/empresas/:empresaId/mensagens", apiKeyAuth());
router.use("/empresas/:empresaId/mensagens", require("./mensagemRoutes"));

module.exports = router;
