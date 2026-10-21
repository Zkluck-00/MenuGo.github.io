const express = require('express');
const router = express.Router();
const cajeroController = require('../controllers/cajero.controller');
const turnosCajaController = require('../controllers/turnos-caja.controller');
const movimientosCajaController = require('../controllers/movimientos-caja.controller');
const cierreTurnosController = require('../controllers/turnos-cierre.controller');
const subcuentasController = require('../controllers/subcuentas.controller');
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

// Commit 18: todas las operaciones sobre subcuentas requieren rol Cajero.
// Importante: rutas mas especificas ANTES de /cuentas/:id/pagos.
router.get('/cuentas/:id/subcuentas', autorizarRoles('cajero'), subcuentasController.listarSubcuentas);
router.post('/cuentas/:id/subcuentas', autorizarRoles('cajero'), subcuentasController.crearSubcuenta);
router.post('/cuentas/:id/subcuentas/:idSubcuenta/detalles', autorizarRoles('cajero'), subcuentasController.asignarProducto);
router.delete('/cuentas/:id/subcuentas/:idSubcuenta/detalles/:idAsignacion', autorizarRoles('cajero'), subcuentasController.eliminarAsignacion);
router.post('/cuentas/:id/subcuentas/:idSubcuenta/pagos', autorizarRoles('cajero'), cajeroController.registrarPago);

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
