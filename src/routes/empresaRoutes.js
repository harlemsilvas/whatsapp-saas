const router = require("express").Router();

const controller = require("../controllers/empresaController");

router.get("/", controller.listar);
router.post("/", controller.criar);
router.get("/:id", controller.obter);
router.put("/:id", controller.atualizar);
router.delete("/:id", controller.remover);

module.exports = router;
