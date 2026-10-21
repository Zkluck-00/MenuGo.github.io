const express = require('express');
const router = express.Router();
const pedidosController = require('../controllers/pedidos.controller');
const { autenticarPersonal, autenticarPersonalOpcional, autorizarRoles } = require('../middleware/auth.middleware');
const { validarAccesoQrMesa } = require('../middleware/mesa-qr.middleware');

// Cliente por QR (sin JWT), y Mesero con JWT. El backend no confia en registrado_por.
router.post('/', autenticarPersonalOpcional, pedidosController.crearPedido);
router.get('/llevar/seguimiento/:codigo', pedidosController.obtenerSeguimientoLlevar);
router.get('/mesa/:id_mesa', validarAccesoQrMesa, pedidosController.obtenerPedidosMesa);
router.post('/mesa/:id_mesa/solicitar-cuenta', validarAccesoQrMesa, pedidosController.solicitarCuenta);
router.post('/mesa/:id_mesa/comentario', validarAccesoQrMesa, pedidosController.enviarComentarioMesa);

// Listado general, consulta por ID y cambio de estado son internos.
router.use(autenticarPersonal, autorizarRoles('mesero', 'cocina', 'cajero', 'administrador'));
router.get('/', pedidosController.listarPedidos);
router.get('/:id/estado', pedidosController.obtenerEstadoPedido);
router.get('/:id', pedidosController.obtenerPedidoPorId);
router.patch('/:id/estado', pedidosController.actualizarEstadoPedido);
module.exports = router;
