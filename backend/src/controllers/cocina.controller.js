'use strict';

const pedidosController = require('./pedidos.controller');

// La consulta de cocina utiliza los estados persistidos en PostgreSQL.
async function listarPedidosCocina(req, res) {
  req.query.rol = 'cocina';
  if (!req.query.estado) req.query.estado = 'pendiente,preparando,listo,pagado';
  return pedidosController.listarPedidos(req, res);
}

// Los permisos del usuario se comprueban mediante JWT en la ruta y en
// pedidos.controller.js. Nunca se confia en un rol enviado por el frontend.
async function cambiarEstadoCocina(req, res) {
  const idPedido = Number(req.params.id);
  if (!Number.isSafeInteger(idPedido) || idPedido <= 0) {
    return res.status(400).json({
      ok: false,
      message: 'El identificador del pedido debe ser un numero entero positivo.',
    });
  }

  const estado = String(req.body?.estado || '').trim().toLowerCase();
  const estadosPermitidos = ['preparando', 'listo', 'cancelado'];
  if (!estadosPermitidos.includes(estado)) {
    return res.status(400).json({
      ok: false,
      message: 'Cocina solo puede cambiar a preparando, listo o cancelado.',
    });
  }

  req.body.estado = estado;
  return pedidosController.actualizarEstadoPedido(req, res);
}

module.exports = { listarPedidosCocina, cambiarEstadoCocina };
