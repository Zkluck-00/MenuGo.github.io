const pedidosController = require("./pedidos.controller");

async function listarPedidosCocina(req, res) {
  req.query.rol = "cocina";
  if (!req.query.estado) req.query.estado = "pendiente,preparando,listo,pagado";
  return pedidosController.listarPedidos(req, res);
}

async function cambiarEstadoCocina(req, res) {
  const estadosPermitidos = ["preparando", "listo", "cancelado"];
  const estado = req.body?.estado;

  if (!estadosPermitidos.includes(estado)) {
    return res.status(400).json({
      ok: false,
      message: "Cocina solo puede cambiar a preparando, listo o cancelado."
    });
  }

  req.body.rol = "cocina";
  return pedidosController.actualizarEstadoPedido(req, res);
}

module.exports = { listarPedidosCocina, cambiarEstadoCocina };
