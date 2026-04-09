const router = require("express").Router();
const controller = require("../controllers/webhookController");
const {
  verifyWhatsAppWebhookSignature,
} = require("../middlewares/whatsappSignature");

router.get("/", controller.verificarWebhook);
router.post("/", verifyWhatsAppWebhookSignature, controller.receberMensagem);

module.exports = router;
