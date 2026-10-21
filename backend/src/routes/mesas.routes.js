const express = require('express');
const router = express.Router();
const mesasController = require('../controllers/mesas.controller');
const { autenticarPersonal, autorizarRoles } = require('../middleware/auth.middleware');

// El cliente solo requiere validar su QR; la lista con tokens QR no es publica.
router.get('/validar-qr', mesasController.validarQrMesa);
router.get('/qr-urls', autenticarPersonal, autorizarRoles('administrador'), mesasController.listarQrMesas);

router.use(autenticarPersonal, autorizarRoles('mesero', 'administrador'));
router.get('/', mesasController.listarMesas);
router.patch('/comentarios/:id/atender', mesasController.atenderComentarioMesa);
router.patch('/solicitudes-cuenta/:id/atender', (req, res) => res.status(403).json({ ok: false, message: 'Las solicitudes de cuenta ahora las atiende el rol Cajero.' }));
router.post('/unir', mesasController.unirMesas);
router.delete('/unir/:mesa_principal', mesasController.desunirMesas);
router.get('/uniones', mesasController.getInfoMesas);
router.patch('/:id/estado', mesasController.cambiarEstadoMesa);
module.exports = router;
