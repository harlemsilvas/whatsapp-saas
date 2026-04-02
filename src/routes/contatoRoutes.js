const router = require("express").Router({ mergeParams: true });
const controller = require("../controllers/contatoController");

router.get("/", controller.listar);
router.post("/", controller.criar);
router.get("/:id", controller.obter);
router.put("/:id", controller.atualizar);
router.delete("/:id", controller.remover);

module.exports = router;
