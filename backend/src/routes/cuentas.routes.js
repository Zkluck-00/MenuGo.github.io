const express = require('express');
const router = express.Router();
const cuentasController = require('../controllers/cuentas.controller');
const { autenticarPersonal, autorizarRoles } = require('../middleware/auth.middleware');

router.use(autenticarPersonal, autorizarRoles('mesero', 'cajero', 'administrador'));
router.get('/activas', cuentasController.listarCuentasActivas);
router.get('/pagos', cuentasController.listarPagos);
router.post('/pagos', (req, res) => res.status(403).json({ ok: false, message: 'Los pagos se registran exclusivamente desde Caja.' }));
module.exports = router;
