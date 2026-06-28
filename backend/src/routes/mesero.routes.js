const express = require("express");
const router = express.Router();
const meseroController = require("../controllers/mesero.controller");

router.get("/pedidos", meseroController.listarPedidosMesero);
router.get("/pedidos/listos", meseroController.listarPedidosListos);
router.patch("/pedidos/:id/entregar", meseroController.marcarEntregado);

module.exports = router;
