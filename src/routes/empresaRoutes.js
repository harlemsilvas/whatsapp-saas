const router = require("express").Router();

const controller = require("../controllers/empresaController");
const aiCredentialController = require("../controllers/aiCredentialController");
const adminSecurityController = require("../controllers/adminSecurityController");
const credentialHealthController = require("../controllers/credentialHealthController");
const aiModelCatalogController = require("../controllers/aiModelCatalogController");

router.get("/", controller.listar);
router.post("/", controller.criar);
router.get("/:id", controller.obter);

// WhatsApp credentials (admin)
router.put("/:id/whatsapp", controller.atualizarWhatsApp);
router.post("/:id/whatsapp/verify", controller.verificarWhatsApp);
router.delete("/:id/whatsapp/token", controller.revogarWhatsApp);

// Onboarding helper
router.get("/:id/onboarding", controller.onboarding);

router.get("/:id/admin-keys", adminSecurityController.listarChaves);
router.post("/:id/admin-keys", adminSecurityController.criarChave);
router.delete(
  "/:id/admin-keys/:keyId",
  adminSecurityController.revogarChave,
);
router.get("/:id/audit", adminSecurityController.listarAuditoria);
router.get("/:id/credential-health", credentialHealthController.obter);
router.get("/:id/ai/models", aiModelCatalogController.listar);
router.post(
  "/:id/ai/credentials/:credentialId/models/sync",
  aiModelCatalogController.sincronizar,
);

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
