const express = require('express');
const router = express.Router();
const cocinaController = require('../controllers/cocina.controller');
const { autenticarPersonal, autorizarRoles } = require('../middleware/auth.middleware');

router.use(autenticarPersonal, autorizarRoles('cocina', 'administrador'));
router.get('/pedidos', cocinaController.listarPedidosCocina);
router.patch('/pedidos/:id/estado', cocinaController.cambiarEstadoCocina);
module.exports = router;
