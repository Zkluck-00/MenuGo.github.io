const express = require("express");
const router = express.Router();
const pedidosController = require("../controllers/pedidos.controller");

router.get("/", pedidosController.listarPedidos);
router.post("/", pedidosController.crearPedido);
router.get("/mesa/:id_mesa", pedidosController.obtenerPedidosMesa);
router.post("/mesa/:id_mesa/solicitar-cuenta", pedidosController.solicitarCuenta);
router.post("/mesa/:id_mesa/comentario", pedidosController.enviarComentarioMesa);
router.get("/:id", pedidosController.obtenerPedidoPorId);
router.get("/:id/estado", pedidosController.obtenerEstadoPedido);
router.patch("/:id/estado", pedidosController.actualizarEstadoPedido);

module.exports = router;
