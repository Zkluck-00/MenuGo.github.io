const express = require('express');
const router = express.Router();
const cajeroController = require('../controllers/cajero.controller');
const turnosCajaController = require('../controllers/turnos-caja.controller');
const movimientosCajaController = require('../controllers/movimientos-caja.controller');
const cierreTurnosController = require('../controllers/turnos-cierre.controller');
const { autenticarPersonal, autorizarRoles } = require('../middleware/auth.middleware');

router.use(autenticarPersonal, autorizarRoles('cajero', 'administrador'));

// Las operaciones de turno solo corresponden a un trabajador con rol cajero.
router.get('/turnos/actual', autorizarRoles('cajero'), turnosCajaController.obtenerTurnoActual);
router.post('/turnos', autorizarRoles('cajero'), turnosCajaController.abrirTurnoCaja);

// Arqueo y cierre de turno del cajero autenticado. Orden de rutas: literal antes de :id.
router.get('/turnos/actual/arqueo', autorizarRoles('cajero'), cierreTurnosController.consultarArqueoActual);
router.get('/turnos/cierres', autorizarRoles('cajero'), cierreTurnosController.listarTurnosCerrados);
router.post('/turnos/:id/cerrar', autorizarRoles('cajero'), cierreTurnosController.cerrarTurnoCaja);

// Movimientos manuales solo del turno abierto del cajero autenticado.
router.get('/turnos/actual/movimientos', autorizarRoles('cajero'), movimientosCajaController.listarMovimientosCaja);
router.post('/turnos/actual/movimientos', autorizarRoles('cajero'), movimientosCajaController.registrarMovimientoCaja);

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
