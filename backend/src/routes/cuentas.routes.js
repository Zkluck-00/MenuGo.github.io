const express = require("express");
const router = express.Router();
const cuentasController = require("../controllers/cuentas.controller");

router.get("/activas", cuentasController.listarCuentasActivas);
router.get("/pagos", cuentasController.listarPagos);
router.post("/pagos", cuentasController.registrarPago);

module.exports = router;
