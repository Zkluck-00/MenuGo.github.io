const express = require('express');
const router = express.Router();
const cajeroController = require('../controllers/cajero.controller');
const { autenticarPersonal, autorizarRoles } = require('../middleware/auth.middleware');

router.use(autenticarPersonal, autorizarRoles('cajero', 'administrador'));

router.get('/resumen', cajeroController.resumenCaja);
router.get('/cuentas', cajeroController.listarCuentas);
router.post('/cuentas/:id/pagos', cajeroController.registrarPago);
router.patch('/solicitudes/:id/atender', cajeroController.atenderSolicitudCuenta);
router.get('/pagos', cajeroController.listarPagos);
router.get('/comprobantes', cajeroController.listarComprobantes);
router.get('/corte/actual', cajeroController.resumenCorteActual);
router.post('/corte', cajeroController.registrarCierreCaja);
router.get('/cortes', cajeroController.listarCierres);

module.exports = router;
