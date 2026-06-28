const pedidosController = require("./pedidos.controller");

async function listarPedidosListos(req, res) {
  req.query.rol = "mesero";
  req.query.estado = req.query.estado || "listo";
  return pedidosController.listarPedidos(req, res);
}

async function listarPedidosMesero(req, res) {
  req.query.rol = "mesero";
  req.query.estado = req.query.estado || "listo,entregado,pagado";
  return pedidosController.listarPedidos(req, res);
}

async function marcarEntregado(req, res) {
  req.body.estado = "entregado";
  req.body.rol = "mesero";
  return pedidosController.actualizarEstadoPedido(req, res);
}

module.exports = { listarPedidosListos, listarPedidosMesero, marcarEntregado };
