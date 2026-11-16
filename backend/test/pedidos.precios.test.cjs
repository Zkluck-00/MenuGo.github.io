'use strict';

// Commit 10 - Pruebas de precios autorizados por PostgreSQL.
// Ejecutan crearPedido del controlador REAL mediante un doble de PostgreSQL.
// Requiere Node.js 20; no requiere conectar a Neon.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fuente = fs.readFileSync(
  path.join(__dirname, '../src/controllers/pedidos.controller.js'), 'utf8'
);

function escenario({ catalogo = {}, insertarError = false } = {}) {
  const catalogoInicial = {
    'pla-1': { id: 10, tipo: 'plato', precio: '25.00', activo: true, disponible_llevar: true },
    'beb-1': { id: 20, tipo: 'bebida', precio: '5.50', activo: true },
    ...catalogo,
  };
  const consultas = [];
  const guardados = [];
  let pedido = null;
  let grupo = 7;
  let nextDetalle = 100;
  let enTransaccion = false;
  const errores = [];

  const cliente = {
    async query(sql, params = []) {
      const texto = String(sql).trim();
      consultas.push({ sql: texto, params });
      if (texto === 'BEGIN') {
        enTransaccion = true;
        return { rows: [] };
      }
      if (texto === 'COMMIT') {
        enTransaccion = false;
        return { rows: [] };
      }
      if (texto === 'ROLLBACK') {
        enTransaccion = false;
        guardados.length = 0;
        return { rows: [] };
      }
      if (/^SELECT id_usuario FROM usuarios/.test(texto)) return { rows: [{ id_usuario: 4 }] };
      if (/^UPDATE usuarios/.test(texto)) return { rows: [] };
      if (/^SELECT id_mesa\s+FROM mesas\s+WHERE numero_mesa = \$1\s+AND qr_token/.test(texto)) {
        return { rows: [{ id_mesa: 15 }] };
      }
      if (/^SELECT gm.id_grupo_mesa/.test(texto)) {
        return { rows: grupo ? [{ id_grupo_mesa: grupo, nombre_grupo: 'Mesa 4', mesa_principal: 4 }] : [] };
      }
      if (/^SELECT id_cuenta FROM cuentas/.test(texto)) return { rows: [{ id_cuenta: 8 }] };
      if (/^SELECT id_plato AS id/.test(texto) || /^SELECT id_bebida AS id/.test(texto)) {
        const item = catalogoInicial[params[0]];
        const buscado = texto.includes('FROM platos') ? 'plato' : 'bebida';
        return { rows: item && item.tipo === buscado ? [{ ...item }] : [] };
      }
      if (/^INSERT INTO pedidos/.test(texto)) {
        assert.ok(enTransaccion, 'Un pedido debe crearse en transaccion');
        pedido = {
          id_pedido: 90, id_grupo_mesa: params[0], id_usuario: params[1],
          tipo_pedido: params[2], nombre_cliente: params[3],
          telefono_llevar: params[4], estado: 'pendiente',
          registrado_por: params[5], fecha_creacion: new Date('2026-10-20T10:00:00Z'),
        };
        return { rows: [{ ...pedido }] };
      }
      if (/^INSERT INTO grupos_mesa/.test(texto)) {
        grupo = 10;
        return { rows: [{ id_grupo_mesa: grupo }] };
      }
      if (/^UPDATE pedidos SET id_grupo_mesa/.test(texto)) {
        pedido.id_grupo_mesa = params[0];
        return { rows: [] };
      }
      if (/^INSERT INTO cuentas/.test(texto)) return { rows: [{ id_cuenta: 8 }] };
      if (/^INSERT INTO detalle_producto/.test(texto)) {
        if (insertarError) throw new Error('Error de BD simulado en detalle_producto');
        const detalle = {
          id_detalle_producto: ++nextDetalle,
          id_pedido: params[0], tipo_producto: params[1],
          id_plato: params[2], id_bebida: params[3],
          cantidad: params[4], precio_unitario: params[5],
          subtotal: params[6], observacion: params[7],
        };
        guardados.push(detalle);
        return { rows: [{ id_detalle_producto: detalle.id_detalle_producto }] };
      }
      if (/^INSERT INTO seguimiento_cocina/.test(texto)) return { rows: [] };
      if (/^UPDATE cuentas c/.test(texto)) return { rows: [] };
      if (/^SELECT p\.\*/.test(texto) && /FROM pedidos p/.test(texto)) {
        const total = guardados.reduce((a, d) => a + Number(d.subtotal), 0);
        return { rows: [{
          ...pedido, id_grupo_mesa: grupo, nombre_grupo: 'Mesa 4',
          mesa_principal: 4, numero_mesa: 4, mesas_unidas: '4',
          telefono: '988888888', total: total.toFixed(2), total_pagado: '0',
        }] };
      }
      if (/^SELECT dp.id_detalle_producto/.test(texto) && /FROM detalle_producto dp/.test(texto)) {
        return { rows: guardados.map(d => {
          const id = d.id_plato || d.id_bebida;
          const codigo = Object.entries(catalogoInicial).find(([, x]) => x.id === id && x.tipo === d.tipo_producto)?.[0];
          return {
            ...d, codigo_producto: codigo, nombre: codigo,
            categoria: d.tipo_producto, estado_cocina: 'recibido',
          };
        }) };
      }
      throw new Error(`Consulta no simulada: ${texto.slice(0, 125)}`);
    },
    release() { assert.equal(enTransaccion, false, 'La transaccion debe terminar'); },
  };

  const mod = { exports: {} };
  vm.runInNewContext(fuente, {
    module: mod, exports: mod.exports,
    console: { log() {}, error(...args) { errores.push(args); } },
    Date, Number, String, Array, Math, Object, RegExp,
    require(nombre) {
      if (nombre === '../config/db') {
        return {
          clientePool: { connect: async () => cliente, query: (...args) => cliente.query(...args) },
          meseroPool: { connect: async () => cliente, query: (...args) => cliente.query(...args) },
          cocinaPool: { connect: async () => cliente },
        };
      }
      if (nombre === '../utils/eventEmitter') {
        return { emitPedidoCreado() {}, emitPedidoActualizado() {} };
      }
      throw new Error(`Dependencia no esperada: ${nombre}`);
    },
  }, { filename: 'pedidos.controller.js' });

  async function crear(body = {}) {
    let statusCode = 200;
    let respuesta;
    const req = {
      body: {
        tipo_pedido: 'mesa', id_mesa: 4, qr_token: 'qr-valido',
        nombre_cliente: 'Cliente de prueba', telefono: '988888888',
        items: [{ codigo_producto: 'pla-1', cantidad: 1 }],
        ...body,
      },
    };
    const res = {
      status(code) { statusCode = code; return this; },
      json(valor) { respuesta = valor; return this; },
    };
    await mod.exports.crearPedido(req, res);
    return { statusCode, respuesta };
  }
  return { crear, guardados, consultas, errores };
}

test('Ignora precio menor adulterado en el navegador', async () => {
  const ctx = escenario();
  const r = await ctx.crear({ items: [{ codigo_producto: 'pla-1', cantidad: 2, precio: 0.01, precio_unitario: 0.01 }] });
  assert.equal(r.statusCode, 201);
  assert.equal(ctx.guardados[0].precio_unitario, '25.00');
  assert.equal(ctx.guardados[0].subtotal, '50.00');
  assert.equal(r.respuesta.data.total, 50);
});

test('Ignora precio superior adulterado para prevenir sobrecobros', async () => {
  const ctx = escenario();
  const r = await ctx.crear({ items: [{ codigo_producto: 'pla-1', cantidad: 1, precio: 4000 }] });
  assert.equal(r.statusCode, 201);
  assert.equal(ctx.guardados[0].precio_unitario, '25.00');
});

test('Acepta pedidos antiguos sin precio en el JSON', async () => {
  const ctx = escenario();
  const r = await ctx.crear();
  assert.equal(r.statusCode, 201);
  assert.equal(ctx.guardados[0].subtotal, '25.00');
});

test('El codigo de bebida obtiene el precio de bebidas en PostgreSQL', async () => {
  const ctx = escenario();
  const r = await ctx.crear({ items: [{ codigo_producto: 'beb-1', cantidad: 2, precio: 0.99, categoria: 'bebidas' }] });
  assert.equal(r.statusCode, 201);
  assert.equal(ctx.guardados[0].tipo_producto, 'bebida');
  assert.equal(ctx.guardados[0].precio_unitario, '5.50');
  assert.equal(ctx.guardados[0].subtotal, '11.00');
});

test('Conserva centimos exactos para precios 0.10 y 0.20', async () => {
  const ctx = escenario({ catalogo: {
    'pla-1': { id: 10, tipo: 'plato', precio: '0.10', activo: true, disponible_llevar: true },
    'pla-2': { id: 11, tipo: 'plato', precio: '0.20', activo: true, disponible_llevar: true },
  } });
  const r = await ctx.crear({ items: [{ codigo_producto: 'pla-1', cantidad: 1 }, { codigo_producto: 'pla-2', cantidad: 1 }] });
  assert.equal(r.statusCode, 201);
  assert.equal(r.respuesta.data.total, 0.3);
  assert.deepEqual(ctx.guardados.map(x => x.subtotal), ['0.10', '0.20']);
});

test('Un producto inexistente no crea pedido ni detalle', async () => {
  const ctx = escenario();
  const r = await ctx.crear({ items: [{ codigo_producto: 'no-existe', cantidad: 1 }] });
  assert.equal(r.statusCode, 400);
  assert.equal(ctx.guardados.length, 0);
  assert.ok(ctx.consultas.some(x => x.sql === 'ROLLBACK'));
  assert.ok(!ctx.consultas.some(x => x.sql.startsWith('INSERT INTO pedidos')));
});

test('Rechaza producto desactivado', async () => {
  const ctx = escenario({ catalogo: { 'pla-1': { id: 10, tipo: 'plato', precio: '25.00', activo: false, disponible_llevar: true } } });
  const r = await ctx.crear();
  assert.equal(r.statusCode, 400);
  assert.match(r.respuesta.error, /no esta activo/);
});

test('Rechaza plato no disponible para llevar', async () => {
  const ctx = escenario({ catalogo: { 'pla-1': { id: 10, tipo: 'plato', precio: '25.00', activo: true, disponible_llevar: false } } });
  const r = await ctx.crear({ tipo_pedido: 'llevar' });
  assert.equal(r.statusCode, 400);
  assert.match(r.respuesta.error, /no esta habilitado para llevar/);
});

for (const cantidad of [0, -1, 1.5, '2.5', 'x', null, true, 1000, Number.POSITIVE_INFINITY]) {
  test(`Rechaza cantidad invalida: ${String(cantidad)}`, async () => {
    const ctx = escenario();
    const r = await ctx.crear({ items: [{ codigo_producto: 'pla-1', cantidad }] });
    assert.equal(r.statusCode, 400);
    assert.equal(ctx.guardados.length, 0);
  });
}

test('Omitir cantidad mantiene compatibilidad (1 unidad)', async () => {
  const ctx = escenario();
  const r = await ctx.crear({ items: [{ codigo_producto: 'pla-1' }] });
  assert.equal(r.statusCode, 201);
  assert.equal(ctx.guardados[0].cantidad, 1);
});

test('Rechaza precios del catalogo invalidos', async () => {
  const ctx = escenario({ catalogo: { 'pla-1': { id: 10, tipo: 'plato', precio: 'sin-precio', activo: true, disponible_llevar: true } } });
  const r = await ctx.crear();
  assert.equal(r.statusCode, 400);
  assert.equal(ctx.guardados.length, 0);
});

test('Error de insercion revierte la transaccion', async () => {
  const ctx = escenario({ insertarError: true });
  const r = await ctx.crear();
  assert.equal(r.statusCode, 400);
  assert.ok(ctx.consultas.some(x => x.sql === 'ROLLBACK'));
  assert.ok(!ctx.consultas.some(x => x.sql === 'COMMIT'));
});

test('Acepta bebida para llevar y conserva total real', async () => {
  const ctx = escenario();
  const r = await ctx.crear({ tipo_pedido: 'llevar', items: [{ codigo_producto: 'beb-1', cantidad: 3, precio: 0.01 }] });
  assert.equal(r.statusCode, 201);
  assert.equal(r.respuesta.data.total, 16.5);
  assert.equal(ctx.guardados[0].subtotal, '16.50');
});
