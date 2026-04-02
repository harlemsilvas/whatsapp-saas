const router = require("express").Router();
const controller = require("../controllers/webhookController");

router.get("/", controller.verificarWebhook);
router.post("/", controller.receberMensagem);

module.exports = router;
