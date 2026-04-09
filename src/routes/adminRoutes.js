const router = require("express").Router();
const apiKeyAuth = require("../middlewares/apiKeyAuth");

const adminUiController = require("../controllers/adminUiController");
const conversaController = require("../controllers/adminConversaController");

// UI (permite passar key via query param para abrir no browser)
router.get(
  "/ui",
  apiKeyAuth({ queryParamName: "key" }),
  adminUiController.adminUi,
);

// API (header x-api-key)
router.get(
  "/empresas/:empresaId/conversas",
  apiKeyAuth(),
  conversaController.listarConversas,
);

router.get(
  "/empresas/:empresaId/conversas/:contatoId/mensagens",
  apiKeyAuth(),
  conversaController.listarMensagens,
);

router.post(
  "/empresas/:empresaId/conversas/:contatoId/read",
  apiKeyAuth(),
  conversaController.marcarComoLida,
);

router.post(
  "/empresas/:empresaId/conversas/:contatoId/send",
  apiKeyAuth(),
  conversaController.enviarManual,
);

router.post(
  "/empresas/:empresaId/conversas/:contatoId/assumir",
  apiKeyAuth(),
  conversaController.assumirAtendimento,
);

router.post(
  "/empresas/:empresaId/conversas/:contatoId/devolver",
  apiKeyAuth(),
  conversaController.devolverParaBot,
);

module.exports = router;
