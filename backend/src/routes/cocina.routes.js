const express = require("express");
const router = express.Router();
const cocinaController = require("../controllers/cocina.controller");

router.get("/pedidos", cocinaController.listarPedidosCocina);
router.patch("/pedidos/:id/estado", cocinaController.cambiarEstadoCocina);

module.exports = router;
