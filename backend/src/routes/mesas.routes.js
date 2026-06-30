const express = require("express");
const router = express.Router();
const mesasController = require("../controllers/mesas.controller");

router.get("/", mesasController.listarMesas);
router.get("/validar-qr", mesasController.validarQrMesa);
router.get("/qr-urls", mesasController.listarQrMesas);
router.patch("/comentarios/:id/atender", mesasController.atenderComentarioMesa);
router.patch("/solicitudes-cuenta/:id/atender", mesasController.atenderSolicitudCuenta);
router.post("/unir", mesasController.unirMesas);
router.delete("/unir/:mesa_principal", mesasController.desunirMesas);
router.get("/uniones", mesasController.getInfoMesas);
router.patch("/:id/estado", mesasController.cambiarEstadoMesa);

module.exports = router;
