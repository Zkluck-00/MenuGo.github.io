'use strict';

// Commit 09: pruebas de flujo de negocio de Caja.
// Node.js >= 20. No requiere PostgreSQL, credenciales ni instalar paquetes.
// El controlador REAL se ejecuta con un doble de PostgreSQL transaccional.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const archivo = path.join(__dirname, '../src/controllers/cajero.controller.js');
const codigo = fs.readFileSync(archivo, 'utf8');
const CLAVE = 'menugo-commit09-pago-00000001';

function centavos(valor) {
  return Math.round(Number(valor) * 100);
}
function moneda(valor) {
  return (valor / 100).toFixed(2);
}

function prepararCaja({
  productos = [{ id: 11, subtotal: '24.50', tipo: 'mesa', estado: 'entregado' }],
  estadoCuenta = 'pendiente',
  cuentaExiste = true,
  errorComprobante = false,
  pedidosPendientesGrupo = false,
} = {}) {
  const lineas = productos.map((p) => ({
    id: p.id,
    subtotal: p.subtotal,
    tipo: p.tipo || 'mesa',
    estado: p.estado || 'entregado',
    pagadoCentavos: centavos(p.pagado || '0.00'),
  }));
  const acciones = [];
  const eventos = [];
  const pagos = [];
  const detallesPagados = [];
  const comprobantes = [];
  let siguienteId = 500;
  let estado = estadoCuenta;
  let grupoCerrado = false;
  let solicitudAtendida = false;

  function crearCliente() {
    let transaccion = null;
    return {
      async query(sql, params = []) {
        const texto = String(sql).trim();
        acciones.push({ sql: texto, params });
        if (/^(ALTER TABLE|CREATE INDEX|CREATE TABLE)/i.test(texto)) return { rows: [] };
        if (texto === 'BEGIN') {
          transaccion = { pago: null, detalles: [], comprobante: null, marcarPagada: false, cerrarGrupo: false, atenderSolicitud: false };
          return { rows: [] };
        }
        if (texto === 'ROLLBACK') {
          transaccion = null;
          return { rows: [] };
        }
        if (texto === 'COMMIT') {
          assert.ok(transaccion, 'COMMIT sin BEGIN');
          if (transaccion.pago) pagos.push(transaccion.pago);
          for (const detalle of transaccion.detalles) {
            detallesPagados.push(detalle);
            const producto = lineas.find((p) => p.id === detalle.id_detalle_producto);
            producto.pagadoCentavos += centavos(detalle.monto);
          }
          if (transaccion.comprobante) comprobantes.push(transaccion.comprobante);
          if (transaccion.marcarPagada) estado = 'pagada';
          if (transaccion.cerrarGrupo) grupoCerrado = true;
          if (transaccion.atenderSolicitud) solicitudAtendida = true;
          transaccion = null;
          return { rows: [] };
        }
        if (/pg_advisory_xact_lock/.test(texto)) return { rows: [{}] };
        if (/WHERE pg.idempotency_key = \$1/.test(texto)) {
          const previo = pagos.find((p) => p.idempotency_key === params[0]);
          return { rows: previo ? [{ ...previo, id_grupo_mesa: 2, comprobante_tipo: 'boleta', comprobante_dni: '12345678' }] : [] };
        }
        if (/SELECT id_cuenta, id_grupo_mesa, estado, total FROM cuentas/.test(texto)) {
          return { rows: cuentaExiste ? [{ id_cuenta: 7, id_grupo_mesa: 2, estado, total: '500.00' }] : [] };
        }
        if (/SELECT dp.id_detalle_producto/.test(texto) && /AS pendiente/.test(texto) && /p.tipo_pedido/.test(texto)) {
          const rows = lineas.map((p) => ({
            id_detalle_producto: p.id,
            id_pedido: 90,
            subtotal: p.subtotal,
            tipo_pedido: p.tipo,
            estado_pedido: p.estado,
            pendiente: moneda(centavos(p.subtotal) - p.pagadoCentavos),
          })).filter((p) => centavos(p.pendiente) > 0);
          return { rows };
        }
        if (/^INSERT INTO pagos/.test(texto)) {
          assert.ok(transaccion, 'INSERT sin BEGIN');
          transaccion.pago = {
            id_pago: ++siguienteId, id_cuenta: params[0], metodo_pago: params[1],
            monto: params[2], pagado_por: params[3], referencia: params[4],
            estado_pago: 'pagado', id_cajero: params[8],
            monto_recibido: params[9], vuelto: params[10],
            idempotency_key: params[11], idempotency_hash: params[12],
          };
          return { rows: [transaccion.pago] };
        }
        if (/^INSERT INTO detalle_pago/.test(texto)) {
          assert.ok(transaccion?.pago, 'Detalle sin pago');
          transaccion.detalles.push({ id_pago: params[0], id_detalle_producto: params[1], monto: params[2] });
          return { rows: [] };
        }
        if (/^INSERT INTO comprobantes/.test(texto)) {
          if (errorComprobante) throw new Error('Falla simulada al guardar comprobante');
          transaccion.comprobante = {
            id_pago: params[0], tipo: params[1], dni: params[2],
            ruc: params[3], razon_social: params[4],
          };
          return { rows: [] };
        }
        if (/SELECT COALESCE\(SUM\(pendiente\), 0\) AS saldo/.test(texto)) {
          const pendientes = lineas.reduce((total, p) => {
            const parcial = transaccion?.detalles
              .filter((d) => d.id_detalle_producto === p.id)
              .reduce((suma, d) => suma + centavos(d.monto), 0) || 0;
            return total + centavos(p.subtotal) - p.pagadoCentavos - parcial;
          }, 0);
          return { rows: [{ saldo: moneda(pendientes) }] };
        }
        if (/^UPDATE cuentas SET estado = 'pagada'/.test(texto)) {
          transaccion.marcarPagada = true;
          return { rows: [] };
        }
        if (/^UPDATE solicitudes_cuenta SET estado = 'atendida'/.test(texto)) {
          transaccion.atenderSolicitud = true;
          return { rows: [] };
        }
        if (/hay_pedidos_pendientes/.test(texto)) {
          return { rows: [{ hay_pedidos_pendientes: pedidosPendientesGrupo, hay_cuentas_pendientes: false }] };
        }
        if (/^UPDATE grupos_mesa SET estado = 'cerrado'/.test(texto)) {
          transaccion.cerrarGrupo = true;
          return { rows: [] };
        }
        throw new Error(`SQL inesperado en la prueba: ${texto.slice(0, 100)}`);
      },
      release() {},
    };
  }

  const mod = { exports: {} };
  vm.runInNewContext(codigo, {
    module: mod, exports: mod.exports,
    require(nombre) {
      if (nombre === 'node:crypto') return require('node:crypto');
      if (nombre === '../config/db') return { cajeroPool: { connect: async () => crearCliente() } };
      if (nombre === './pedidos.controller') return { mapMetodoPago: () => 'efectivo' };
      if (nombre === '../utils/eventEmitter') return {
        emitPagoRegistrado(pago) { eventos.push({ tipo: 'pago', pago }); },
        emitCuentaActualizada(cuenta) { eventos.push({ tipo: 'cuenta', cuenta }); },
      };
      throw new Error(`Modulo inesperado: ${nombre}`);
    },
    console: { error() {} },
  }, { filename: archivo });

  async function cobrar({
    idCuenta = 7, idCajero = 9, clave = CLAVE,
    body = {},
  } = {}) {
    const respuesta = {
      statusCode: 200, payload: null,
      status(codigo) { this.statusCode = codigo; return this; },
      json(datos) { this.payload = datos; return this; },
    };
    await mod.exports.registrarPago({
      params: { id: String(idCuenta) },
      personal: { id_trabajador: idCajero, nombre: 'Cajero prueba' },
      body: {
        metodo_pago: 'Efectivo', monto_recibido: '50.00',
        detalles: [{ id_detalle_producto: 11, monto: '0.01' }],
        tipo_comprobante: 'boleta', dni: '12345678',
        idempotency_key: clave,
        ...body,
      },
    }, respuesta);
    return respuesta;
  }

  return {
    cobrar, acciones, eventos, pagos, detallesPagados, comprobantes,
    estadoCuenta: () => estado,
    grupoCerrado: () => grupoCerrado,
    solicitudAtendida: () => solicitudAtendida,
    insertados: () => acciones.filter(({ sql }) => /^INSERT INTO pagos/.test(sql)).length,
    rollbacks: () => acciones.filter(({ sql }) => sql === 'ROLLBACK').length,
  };
}

const dosProductos = [
  { id: 11, subtotal: '24.50', tipo: 'mesa', estado: 'entregado' },
  { id: 12, subtotal: '18.00', tipo: 'mesa', estado: 'preparando' },
];

test('cobra solo el producto entregado y deja pendiente lo que sigue en cocina', async () => {
  const caja = prepararCaja({ productos: dosProductos });
  const r = await caja.cobrar();
  assert.equal(r.statusCode, 201);
  assert.equal(r.payload.data.monto, '24.50');
  assert.equal(r.payload.data.saldo_pendiente, 18);
  assert.equal(caja.detallesPagados.length, 1);
  assert.equal(caja.detallesPagados[0].id_detalle_producto, 11);
  assert.equal(caja.estadoCuenta(), 'pendiente');
  assert.equal(caja.grupoCerrado(), false);
});

test('el servidor ignora el importe manipulado por el navegador', async () => {
  const caja = prepararCaja();
  const r = await caja.cobrar({ body: { detalles: [{ id_detalle_producto: 11, monto: '0.01' }], monto: '0.01', vuelto: '999.99' } });
  assert.equal(r.statusCode, 201);
  assert.equal(caja.pagos[0].monto, '24.50');
  assert.equal(caja.pagos[0].vuelto, '25.50');
});

test('dos cobros parciales distintos completan una cuenta y cierran el grupo', async () => {
  const caja = prepararCaja({ productos: dosProductos.map((p) => ({ ...p, estado: 'entregado' })) });
  const primero = await caja.cobrar();
  assert.equal(primero.statusCode, 201);
  assert.equal(primero.payload.data.saldo_pendiente, 18);
  assert.equal(caja.estadoCuenta(), 'pendiente');
  const segundo = await caja.cobrar({ clave: 'menugo-commit09-segundo-pago', body: {
    detalles: [{ id_detalle_producto: 12, monto: '0.01' }],
    monto_recibido: '20.00',
  } });
  assert.equal(segundo.statusCode, 201);
  assert.equal(segundo.payload.data.monto, '18.00');
  assert.equal(segundo.payload.data.saldo_pendiente, 0);
  assert.equal(caja.pagos.length, 2);
  assert.equal(caja.estadoCuenta(), 'pagada');
  assert.equal(caja.grupoCerrado(), true);
  assert.equal(caja.solicitudAtendida(), true);
});

test('un grupo con pedidos todavia pendientes no se cierra al pagar', async () => {
  const caja = prepararCaja({ pedidosPendientesGrupo: true });
  const r = await caja.cobrar();
  assert.equal(r.statusCode, 201);
  assert.equal(caja.estadoCuenta(), 'pagada');
  assert.equal(caja.grupoCerrado(), false);
});

test('rechaza cobrar toda una mesa cuando hay productos no entregados', async () => {
  const caja = prepararCaja({ productos: dosProductos });
  const r = await caja.cobrar({ body: { detalles: undefined } });
  assert.equal(r.statusCode, 400);
  assert.match(r.payload.message, /solo se pueden cobrar productos entregados/i);
  assert.equal(caja.pagos.length, 0);
  assert.equal(caja.detallesPagados.length, 0);
});

test('rechaza productos que no pertenecen a la cuenta antes de INSERT', async () => {
  const caja = prepararCaja();
  const r = await caja.cobrar({ body: { detalles: [{ id_detalle_producto: 999 }] } });
  assert.equal(r.statusCode, 400);
  assert.match(r.payload.message, /no pertenecen/i);
  assert.equal(caja.insertados(), 0);
});

test('un pedido de mesa en estado listo todavia no es cobrable', async () => {
  const caja = prepararCaja({ productos: [{ id: 11, subtotal: '24.50', tipo: 'mesa', estado: 'listo' }] });
  const r = await caja.cobrar();
  assert.equal(r.statusCode, 400);
  assert.match(r.payload.message, /solo se pueden cobrar productos entregados/i);
  assert.equal(caja.pagos.length, 0);
});

test('un pedido para llevar listo se puede cobrar sin marcarlo entregado', async () => {
  const caja = prepararCaja({ productos: [{ id: 11, subtotal: '24.50', tipo: 'llevar', estado: 'listo' }] });
  const r = await caja.cobrar();
  assert.equal(r.statusCode, 201);
  assert.equal(caja.pagos.length, 1);
});

test('una factura correcta guarda RUC y razon social sin DNI', async () => {
  const caja = prepararCaja();
  const r = await caja.cobrar({ body: {
    tipo_comprobante: 'factura', dni: null,
    ruc: '20123456789', razon_social: 'Restaurante de prueba SAC',
  } });
  assert.equal(r.statusCode, 201);
  assert.equal(caja.comprobantes.length, 1);
  assert.deepEqual(caja.comprobantes[0], {
    id_pago: 501, tipo: 'factura', dni: null,
    ruc: '20123456789', razon_social: 'Restaurante de prueba SAC',
  });
});

test('factura sin razon social es rechazada sin guardar pago', async () => {
  const caja = prepararCaja();
  const r = await caja.cobrar({ body: { tipo_comprobante: 'factura', ruc: '20123456789', razon_social: '' } });
  assert.equal(r.statusCode, 400);
  assert.equal(caja.insertados(), 0);
});

test('cuenta inexistente devuelve 404 sin registrar pago', async () => {
  const caja = prepararCaja({ cuentaExiste: false });
  const r = await caja.cobrar();
  assert.equal(r.statusCode, 404);
  assert.equal(caja.insertados(), 0);
});

test('cuenta ya pagada no permite nuevos cobros', async () => {
  const caja = prepararCaja({ estadoCuenta: 'pagada' });
  const r = await caja.cobrar();
  assert.equal(r.statusCode, 400);
  assert.equal(caja.insertados(), 0);
});

test('si falla el comprobante se revierte la transaccion y no se emiten eventos', async () => {
  const caja = prepararCaja({ errorComprobante: true });
  const r = await caja.cobrar();
  assert.equal(r.statusCode, 500);
  assert.equal(r.payload.code, 'PAGO_NO_CONFIRMADO');
  assert.equal(caja.pagos.length, 0);
  assert.equal(caja.detallesPagados.length, 0);
  assert.equal(caja.comprobantes.length, 0);
  assert.equal(caja.eventos.length, 0);
  assert.equal(caja.rollbacks(), 1);
});

test('reintentar el mismo producto pagado con otra clave no crea un segundo cobro', async () => {
  const caja = prepararCaja({ productos: dosProductos.map((p) => ({ ...p, estado: 'entregado' })) });
  assert.equal((await caja.cobrar()).statusCode, 201);
  const r = await caja.cobrar({ clave: 'menugo-commit09-intento-nuevo-pago' });
  assert.equal(r.statusCode, 400);
  assert.equal(caja.pagos.length, 1);
});

test('IDs de cuenta o trabajador invalidos no permiten INSERT', async () => {
  for (const opciones of [{ idCuenta: -1 }, { idCajero: 0 }, { idCuenta: 'no-es-numero' }]) {
    const caja = prepararCaja();
    const r = await caja.cobrar(opciones);
    assert.ok([400, 401].includes(r.statusCode));
    assert.equal(caja.pagos.length, 0);
  }
});
