const pedidosController = require("./pedidos.controller");

async function listarPedidosCocina(req, res) {
  req.query.rol = "cocina";
  if (!req.query.estado) req.query.estado = "pendiente,preparando,listo,pagado";
  return pedidosController.listarPedidos(req, res);
}

// MEJORA: Validación de seguridad. Evita que desde el frontend hackeen el estado
async function cambiarEstadoCocina(req, res) {
    const idPedido = Number(req.params.id);

  if (!Number.isSafeInteger(idPedido) || idPedido <= 0) {
    return res.status(400).json({
      ok: false,
      message: "El identificador del pedido debe ser un número entero positivo."
    });
  }
  const estadosPermitidos = ["preparando", "listo", "cancelado"];
  const estado = req.body?.estado;

  if (!estadosPermitidos.includes(estado)) {
    return res.status(400).json({
      ok: false,
      message: "Cocina solo puede cambiar a preparando, listo o cancelado."
    });
  const nuevoEstado = req.body.estado;
  
  // Array con los únicos estados que la cocina tiene permitido usar
  const estadosPermitidosCocina = ["pendiente", "En preparación", "listo"];
  
  if (!estadosPermitidosCocina.includes(nuevoEstado)) {
      return res.status(403).json({ 
          error: `Acción denegada. El rol 'cocina' no puede cambiar el estado a '${nuevoEstado}'.` 
      });
  }

  req.body.rol = "cocina";
  return pedidosController.actualizarEstadoPedido(req, res);
}

module.exports = { listarPedidosCocina, cambiarEstadoCocina };
