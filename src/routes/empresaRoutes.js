const router = require("express").Router();

const controller = require("../controllers/empresaController");

router.get("/", controller.listar);
router.post("/", controller.criar);
router.get("/:id", controller.obter);

// WhatsApp credentials (admin)
router.put("/:id/whatsapp", controller.atualizarWhatsApp);
router.post("/:id/whatsapp/verify", controller.verificarWhatsApp);

// Onboarding helper
router.get("/:id/onboarding", controller.onboarding);

router.put("/:id", controller.atualizar);
router.delete("/:id", controller.remover);

module.exports = router;
