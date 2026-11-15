const express = require("express");
const router = express.Router();
const cuentasController = require("../controllers/cuentas.controller");

router.get("/activas", cuentasController.listarCuentasActivas);
router.get("/pagos", cuentasController.listarPagos);
router.post("/pagos", (req, res) => res.status(403).json({ ok: false, message: "El registro de pagos fue trasladado al modulo Cajero." }));

module.exports = router;
