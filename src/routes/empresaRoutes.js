const router = require("express").Router();

const controller = require("../controllers/empresaController");
const aiCredentialController = require("../controllers/aiCredentialController");

router.get("/", controller.listar);
router.post("/", controller.criar);
router.get("/:id", controller.obter);

// WhatsApp credentials (admin)
router.put("/:id/whatsapp", controller.atualizarWhatsApp);
router.post("/:id/whatsapp/verify", controller.verificarWhatsApp);

// Onboarding helper
router.get("/:id/onboarding", controller.onboarding);

// Configuracao de IA por empresa (segredos nunca retornam pela API).
router.get("/:id/ai/credentials", aiCredentialController.listar);
router.post("/:id/ai/credentials", aiCredentialController.criar);
router.put(
  "/:id/ai/credentials/:credentialId",
  aiCredentialController.atualizar,
);
router.post(
  "/:id/ai/credentials/:credentialId/verify",
  aiCredentialController.verificar,
);
router.delete(
  "/:id/ai/credentials/:credentialId",
  aiCredentialController.remover,
);

router.put("/:id", controller.atualizar);
router.delete("/:id", controller.remover);

module.exports = router;
