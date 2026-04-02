const router = require("express").Router();

router.use("/webhook", require("./webhookRoutes"));
router.use("/empresas", require("./empresaRoutes"));

// Recursos multi-tenant (sempre dentro de uma empresa)
router.use("/empresas/:empresaId/contatos", require("./contatoRoutes"));
router.use("/empresas/:empresaId/mensagens", require("./mensagemRoutes"));

module.exports = router;
