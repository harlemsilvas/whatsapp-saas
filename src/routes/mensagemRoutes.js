const router = require("express").Router({ mergeParams: true });
const controller = require("../controllers/mensagemController");

router.get("/", controller.listar);
router.post("/", controller.criar);
router.get("/:id", controller.obter);
router.delete("/:id", controller.remover);

module.exports = router;
