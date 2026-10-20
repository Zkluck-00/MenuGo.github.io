'use strict';

// Tests sin conexion a PostgreSQL: simulan las consultas del controlador.
// Ejecutar desde la raiz de MenuGo:
// node --test backend/test/cajero.metodos.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const archivoControlador = path.join(__dirname, '../src/controllers/cajero.controller.js');
const fuente = fs.readFileSync(archivoControlador, 'utf8');

function crearEscenario({ estadoPedido = 'entregado' } = {}) {
  const consultas = [];
  const eventos = [];
  const cliente = {
    async query(sql, parametros = []) {
      consultas.push({ sql: sql.trim(), parametros });
      if (/SELECT id_cuenta, id_grupo_mesa, estado, total FROM cuentas/.test(sql)) {
        return { rows: [{ id_cuenta: 7, id_grupo_mesa: 2, estado: 'pendiente', total: '24.50' }] };
      }
      if (/SELECT dp.id_detalle_producto/.test(sql) && /p.tipo_pedido/.test(sql) && /AS pendiente/.test(sql)) {
        return { rows: [{ id_detalle_producto: 11, id_pedido: 6, subtotal: '24.50', tipo_pedido: 'mesa', estado_pedido: estadoPedido, pendiente: '24.50' }] };
      }
      if (/INSERT INTO pagos/.test(sql)) {
        return { rows: [{ id_pago: 100, id_cuenta: 7, metodo_pago: parametros[1], monto: parametros[2], referencia: parametros[4] }] };
      }
      if (/SELECT COALESCE\(SUM\(pendiente\), 0\) AS saldo/.test(sql)) {
        return { rows: [{ saldo: '0.00' }] };
      }
      if (/hay_pedidos_pendientes/.test(sql)) {
        return { rows: [{ hay_pedidos_pendientes: false, hay_cuentas_pendientes: false }] };
      }
      return { rows: [] };
    },
    release() {},
  };

  const dependencias = {
    '../config/db': { cajeroPool: { connect: async () => cliente, query: (...args) => cliente.query(...args) } },
    './pedidos.controller': { mapMetodoPago: () => 'efectivo' },
    '../utils/eventEmitter': {
      emitPagoRegistrado: (pago) => eventos.push(pago),
      emitCuentaActualizada: () => {},
    },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fuente, {
    module: modulo,
    exports: modulo.exports,
    require(nombre) {
      if (!(nombre in dependencias)) throw new Error(`Dependencia inesperada: ${nombre}`);
      return dependencias[nombre];
    },
    console: { error() {} },
  }, { filename: archivoControlador });
  return { controlador: modulo.exports, consultas, eventos };
}

async function pagar(body, opciones = {}) {
  const escenario = crearEscenario(opciones);
  const respuesta = {
    statusCode: 200,
    payload: null,
    status(codigo) { this.statusCode = codigo; return this; },
    json(data) { this.payload = data; return this; },
  };
  const datos = {
    tipo_comprobante: 'boleta',
    dni: '12345678',
    detalles: [{ id_detalle_producto: 11, monto: 0.01 }],
    ...body,
  };
  await escenario.controlador.registrarPago({
    params: { id: '7' },
    personal: { id_trabajador: 9, nombre: 'Prueba' },
    body: datos,
  }, respuesta);
  const insert = escenario.consultas.find((c) => /INSERT INTO pagos/.test(c.sql));
  return { ...escenario, respuesta, insert };
}

const metodosValidos = [
  ['Efectivo', 'efectivo', null],
  ['Yape', 'yape', 'OP-1234'],
  ['Plin', 'plin', 'OP-1234'],
  ['Tarjeta credito', 'tarjeta_credito', 'OP-1234'],
  ['Tarjeta débito', 'tarjeta_debito', 'OP-1234'],
  ['tarjeta_credito', 'tarjeta_credito', 'OP-1234'],
];

for (const [etiqueta, esperado, referencia] of metodosValidos) {
  test(`acepta ${etiqueta} y registra ${esperado}`, async () => {
    const { respuesta, insert, eventos } = await pagar({ metodo_pago: etiqueta, referencia });
    assert.equal(respuesta.statusCode, 201);
    assert.equal(respuesta.payload.ok, true);
    assert.ok(insert);
    assert.equal(insert.parametros[1], esperado);
    assert.equal(insert.parametros[4], referencia);
    assert.equal(insert.parametros[2], 24.5); // No confia en el monto del navegador
    assert.equal(eventos.length, 1);
  });
}

test('no convierte metodos desconocidos a efectivo', async () => {
  const { respuesta, insert } = await pagar({ metodo_pago: 'bitcoin', referencia: 'OP-1234' });
  assert.equal(respuesta.statusCode, 400);
  assert.match(respuesta.payload.message, /metodo de pago invalido/i);
  assert.equal(insert, undefined);
});

test('no acepta metodos omitidos ni objetos', async () => {
  for (const metodo_pago of [undefined, {}, 12, '']) {
    const { respuesta, insert } = await pagar({ metodo_pago });
    assert.equal(respuesta.statusCode, 400);
    assert.equal(insert, undefined);
  }
});

test('Yape, Plin y tarjetas requieren referencia', async () => {
  for (const metodo_pago of ['Yape', 'Plin', 'Tarjeta credito', 'Tarjeta debito']) {
    for (const referencia of [undefined, ' ', 'X1', 'X\n123']) {
      const { respuesta, insert } = await pagar({ metodo_pago, referencia });
      assert.equal(respuesta.statusCode, 400, `${metodo_pago}: ${referencia}`);
      assert.equal(insert, undefined);
    }
  }
});

test('permite codigo_aprobacion como alias de referencia', async () => {
  const { respuesta, insert } = await pagar({ metodo_pago: 'Yape', codigo_aprobacion: 'YAPE-1024' });
  assert.equal(respuesta.statusCode, 201);
  assert.equal(insert.parametros[4], 'YAPE-1024');
});

test('no guarda referencias en un pago en efectivo', async () => {
  const { respuesta, insert } = await pagar({ metodo_pago: 'Efectivo', referencia: 'NO-CORRESPONDE' });
  assert.equal(respuesta.statusCode, 201);
  assert.equal(insert.parametros[4], null);
});

test('impide que una lista vacia cobre toda la cuenta', async () => {
  const { respuesta, insert } = await pagar({ metodo_pago: 'Efectivo', detalles: [] });
  assert.equal(respuesta.statusCode, 400);
  assert.match(respuesta.payload.message, /selecciona al menos un producto/i);
  assert.equal(insert, undefined);
});

test('rechaza IDs de productos duplicados o invalidos', async () => {
  for (const detalles of [
    [{ id_detalle_producto: 11 }, { id_detalle_producto: 11 }],
    [{ id_detalle_producto: -1 }],
    [{ id_detalle_producto: 'invalido' }],
  ]) {
    const { respuesta, insert } = await pagar({ metodo_pago: 'Efectivo', detalles });
    assert.equal(respuesta.statusCode, 400);
    assert.equal(insert, undefined);
  }
});

test('sigue impidiendo pagar productos no entregados', async () => {
  const { respuesta, insert } = await pagar({ metodo_pago: 'Efectivo' }, { estadoPedido: 'preparando' });
  assert.equal(respuesta.statusCode, 400);
  assert.equal(insert, undefined);
});
