const EventEmitter = require('events');

class RealTimeEvents extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  emitPedidoCreado(pedido) {
    this.emit('pedido:creado', pedido);
  }

  emitPedidoActualizado(pedido) {
    this.emit('pedido:actualizado', pedido);
  }

  emitMesaActualizada(mesa) {
    this.emit('mesa:actualizada', mesa);
  }

  emitCuentaActualizada(cuenta) {
    this.emit('cuenta:actualizada', cuenta);
  }

  emitPagoRegistrado(pago) {
    this.emit('pago:registrado', pago);
  }

  emitPagoCruzadoRegistrado(pago) {
    this.emit('pago:cruzado:registrado', pago);
  }

  emitProductoActualizado(producto) {
    this.emit('producto:actualizado', producto);
  }

  emitCuentasActualizadas(cuentas) {
    this.emit('cuentas:actualizadas', cuentas);
  }

  emitPedidoCancelado(pedido) {
    this.emit('pedido:cancelado', pedido);
  }

  emitNuevoProducto(producto) {
    this.emit('producto:nuevo', producto);
  }

  emitProductoEliminado(productoId) {
    this.emit('producto:eliminado', productoId);
  }
}

module.exports = new RealTimeEvents();