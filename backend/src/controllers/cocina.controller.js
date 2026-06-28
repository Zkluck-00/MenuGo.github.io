const pedidosController = require("./pedidos.controller");

async function listarPedidosCocina(req, res) {
  req.query.rol = "cocina";
  if (!req.query.estado) req.query.estado = "pendiente,preparando,listo,pagado";
  return pedidosController.listarPedidos(req, res);
}

async function cambiarEstadoCocina(req, res) {
  req.body.rol = "cocina";
  return pedidosController.actualizarEstadoPedido(req, res);
}

module.exports = { listarPedidosCocina, cambiarEstadoCocina };
