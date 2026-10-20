'use strict';

// Commit 09: contrato entre datos de caja, tarjetas, filtros y dashboard.
// El JS real se ejecuta en un entorno DOM simulado; no requiere navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rutaFrontend = path.resolve(__dirname, '../../Frontend/js/caja.js');
const fuenteFrontend = fs.readFileSync(rutaFrontend, 'utf8');
const rutaControlador = path.resolve(__dirname, '../src/controllers/cajero.controller.js');
const fuenteControlador = fs.readFileSync(rutaControlador, 'utf8');

function producto(id, pendiente, puede = true, nombre = `Plato ${id}`) {
  return {
    id_detalle_producto: id,
    id_pedido: 40,
    monto_pendiente: pendiente,
    puede_pagarse: puede,
    nombre,
  };
}
function cuenta(id, items, extra = {}) {
  const pendiente = items.reduce((total, item) => total + Number(item.monto_pendiente), 0);
  return {
    id_cuenta: id, etiqueta: `Mesa ${id}`, mesas: [id],
    total: pendiente, total_pagado: 0, total_pendiente: pendiente,
    detalles: items, es_llevar: false, solicitud_cuenta: null,
    ...extra,
  };
}

function prepararInterfaz() {
  const mensajes = [];
  const estados = new Map();
  const crearElemento = () => ({
    textContent: '', innerHTML: '', className: '', value: '',
    disabled: false,
    classList: { add() {}, remove() {} },
    addEventListener() {}, focus() {},
  });
  function obtener(id) {
    if (!estados.has(id)) estados.set(id, crearElemento());
    return estados.get(id);
  }
  obtener('metodo-cobro-caja').value = 'Efectivo';
  obtener('comprobante-caja').value = 'boleta';
  const mundo = vm.createContext({
    window: { MENUGO_PERSONAL_BLOQUEADO: false, MENUGO_API: '/api', location: { search: '' } },
    URLSearchParams,
    document: {
      getElementById: obtener,
      querySelectorAll(selector) {
        if (selector === '.item-cobro-caja:checked') return [];
        return [];
      },
      addEventListener() {},
    },
    alert(texto) { mensajes.push(texto); },
    setTimeout() {}, setInterval() {},
  });
  vm.runInContext(fuenteFrontend, mundo, { filename: rutaFrontend });
  function ejecutar(codigo) { return vm.runInContext(codigo, mundo); }
  function cargar(lista, resumen = {}) {
    ejecutar(`cuentasCaja = ${JSON.stringify(lista)}; resumenCaja = ${JSON.stringify(resumen)};`);
  }
  return { cargar, ejecutar, obtener, mensajes };
}

test('clasifica correctamente: lista, parcial y esperando', () => {
  const ui = prepararInterfaz();
  const lista = [
    cuenta(1, [producto(11, 10, true)]),
    cuenta(2, [producto(12, 15, true), producto(13, 20, false)]),
    cuenta(3, [producto(14, 30, false)]),
  ];
  ui.cargar(lista);
  const tipos = ui.ejecutar('cuentasCaja.map(c => clasificarCuentaCaja(c).tipo)');
  assert.equal(Array.from(tipos).join(','), 'lista,parcial,esperando');
});

test('productos entregados sin saldo no habilitan cobrar nuevamente', () => {
  const ui = prepararInterfaz();
  ui.cargar([cuenta(1, [producto(11, 0, true)])]);
  assert.equal(ui.ejecutar('productosCobrablesCaja(cuentasCaja[0]).length'), 0);
  assert.equal(ui.ejecutar('clasificarCuentaCaja(cuentasCaja[0]).tipo'), 'esperando');
});

test('dashboard separa saldo general de los cobros propios del cajero', () => {
  const ui = prepararInterfaz();
  ui.cargar([
    cuenta(1, [producto(11, 10, true)]),
    cuenta(2, [producto(12, 15, true), producto(13, 20, false)], { solicitud_cuenta: { id_solicitud: 9 } }),
    cuenta(3, [producto(14, 30, false)]),
  ], {
    pagos_hoy_cajero: 3,
    total_hoy_cajero: 75,
    por_metodo: { efectivo: 40, yape: 15, plin: 5, tarjeta_credito: 10, tarjeta_debito: 5 },
  });
  ui.ejecutar('renderEstadisticasCaja()');
  assert.equal(ui.obtener('stat-cuentas').textContent, 3);
  assert.equal(ui.obtener('stat-listas').textContent, 1);
  assert.equal(ui.obtener('stat-parciales').textContent, 1);
  assert.equal(ui.obtener('stat-espera').textContent, 1);
  assert.equal(ui.obtener('stat-solicitudes').textContent, 1);
  assert.equal(ui.obtener('stat-por-cobrar').textContent, 'S/ 75.00');
  assert.equal(ui.obtener('stat-cobradas').textContent, 3);
  assert.equal(ui.obtener('stat-efectivo').textContent, 'S/ 40.00');
  assert.equal(ui.obtener('stat-tarjeta').textContent, 'S/ 35.00');
  assert.equal(ui.obtener('stat-total').textContent, 'S/ 75.00');
});

test('un dashboard sin cuentas ni pagos muestra ceros y no NaN', () => {
  const ui = prepararInterfaz();
  ui.cargar([], {});
  ui.ejecutar('renderEstadisticasCaja()');
  assert.equal(ui.obtener('stat-cuentas').textContent, 0);
  assert.equal(ui.obtener('stat-por-cobrar').textContent, 'S/ 0.00');
  assert.equal(ui.obtener('stat-total').textContent, 'S/ 0.00');
});

test('filtro listas incluye cobros parciales, pero excluye mesas esperando', () => {
  const ui = prepararInterfaz();
  ui.cargar([
    cuenta(1, [producto(11, 10, true)]),
    cuenta(2, [producto(12, 15, true), producto(13, 20, false)]),
    cuenta(3, [producto(14, 30, false)]),
  ]);
  ui.ejecutar("filtroCaja = 'listas'; renderContenidoCaja();");
  const html = ui.obtener('contenedor-cuentas').innerHTML;
  assert.match(html, /Mesa 1/);
  assert.match(html, /Mesa 2/);
  assert.doesNotMatch(html, /Mesa 3/);
});

test('filtro solicitudes incluye solo cuentas que solicitaron atención', () => {
  const ui = prepararInterfaz();
  ui.cargar([
    cuenta(1, [producto(11, 10)], { solicitud_cuenta: { id_solicitud: 8, fecha_solicitud: '2026-10-20T15:00:00Z' } }),
    cuenta(2, [producto(12, 10)]),
  ]);
  ui.ejecutar("filtroCaja = 'solicitadas'; renderContenidoCaja();");
  const html = ui.obtener('contenedor-cuentas').innerHTML;
  assert.match(html, /Mesa 1/);
  assert.doesNotMatch(html, /Mesa 2/);
});

test('filtro llevar muestra unicamente pedidos para llevar', () => {
  const ui = prepararInterfaz();
  ui.cargar([
    cuenta(1, [producto(11, 10)]),
    cuenta(2, [producto(12, 12)], { es_llevar: true }),
  ]);
  ui.ejecutar("filtroCaja = 'llevar'; renderContenidoCaja();");
  const html = ui.obtener('contenedor-cuentas').innerHTML;
  assert.match(html, /Mesa 2/);
  assert.doesNotMatch(html, /Mesa 1/);
});

test('tarjetas escapan nombres y notas HTML de clientes', () => {
  const ui = prepararInterfaz();
  ui.cargar([
    cuenta(1, [producto(11, 10)], {
      etiqueta: '<img src=x onerror=alert(1)>',
      solicitud_cuenta: { id_solicitud: 3, nota: '<script>robar()</script>' },
    }),
  ]);
  ui.ejecutar('renderCuentasCaja(cuentasCaja)');
  const html = ui.obtener('contenedor-cuentas').innerHTML;
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>robar/);
});

test('formulario de cobro solo muestra productos habilitados', () => {
  const ui = prepararInterfaz();
  ui.cargar([cuenta(7, [
    producto(11, 15, true, 'Arroz entregado'),
    producto(12, 24, false, 'Pollo en cocina'),
  ])]);
  ui.ejecutar('abrirCobroCaja(7)');
  const html = ui.obtener('contenido-cobro').innerHTML;
  assert.match(html, /Arroz entregado/);
  assert.doesNotMatch(html, /Pollo en cocina/);
  assert.match(html, /Disponible para cobrar: S\/ 15\.00/);
  assert.match(html, /Saldo de la cuenta: S\/ 39\.00/);
});

test('el dinero se suma en centimos exactos', () => {
  const ui = prepararInterfaz();
  assert.equal(ui.ejecutar("evaluarEfectivoCaja('0.30', 0.10 + 0.20).valor"), 0);
  assert.equal(ui.ejecutar("evaluarEfectivoCaja('0.50', 0.10 + 0.20).valor"), 0.2);
});

function prepararResumenBackend() {
  const consultas = [];
  const filas = [
    { id_cuenta: 1, id_grupo_mesa: 101, nombre_grupo: 'Mesa 1', mesas: [1], id_solicitud: null },
    { id_cuenta: 2, id_grupo_mesa: 102, nombre_grupo: 'Mesa 2', mesas: [2], id_solicitud: 44, solicitud_nota: 'Traer la cuenta' },
    { id_cuenta: 3, id_grupo_mesa: 103, nombre_grupo: 'Mesa 3', mesas: [3], id_solicitud: null },
  ];
  const items = {
    101: [{ subtotal: '30.00', monto_pagado: '0.00', estado_pedido: 'entregado' }],
    102: [
      { subtotal: '12.00', monto_pagado: '0.00', estado_pedido: 'entregado' },
      { subtotal: '18.00', monto_pagado: '0.00', estado_pedido: 'preparando' },
    ],
    103: [{ subtotal: '20.00', monto_pagado: '0.00', estado_pedido: 'preparando' }],
  };
  async function consulta(sql, params = []) {
    const s = String(sql).trim();
    consultas.push({ sql: s, params });
    if (/^(ALTER TABLE|CREATE INDEX|CREATE TABLE)/.test(s)) return { rows: [] };
    if (/SELECT c.id_cuenta/.test(s) && /FROM cuentas c/.test(s)) return { rows: filas };
    if (/SELECT dp.id_detalle_producto/.test(s) && /monto_pagado/.test(s)) {
      return { rows: (items[params[0]] || []).map((p, i) => ({
        id_detalle_producto: Number(params[0]) * 10 + i, id_pedido: Number(params[0]),
        nombre: 'Plato', precio_unitario: p.subtotal,
        cantidad: 1, tipo_pedido: 'mesa', ...p,
      })) };
    }
    if (/SELECT COALESCE\(SUM\(dp.subtotal\), 0\) AS total/.test(s)) {
      return { rows: [{ total: (items[params[0]] || []).reduce((sum, p) => sum + Number(p.subtotal), 0).toFixed(2) }] };
    }
    if (/SELECT metodo_pago/.test(s) && /GROUP BY metodo_pago/.test(s)) {
      assert.match(s, /id_cajero = \$1/);
      assert.match(s, /fecha_pago >= CURRENT_DATE/);
      return { rows: Number(params[0]) === 9 ? [
        { metodo_pago: 'efectivo', cantidad: 2, total: '50.00' },
        { metodo_pago: 'yape', cantidad: 1, total: '15.00' },
      ] : [] };
    }
    throw new Error(`SQL inesperado: ${s.slice(0, 100)}`);
  }
  const modulo = { exports: {} };
  vm.runInNewContext(fuenteControlador, {
    module: modulo, exports: modulo.exports,
    require(nombre) {
      if (nombre === 'node:crypto') return require('node:crypto');
      if (nombre === '../config/db') return { cajeroPool: { query: consulta } };
      if (nombre === './pedidos.controller') return { mapMetodoPago: () => 'efectivo' };
      if (nombre === '../utils/eventEmitter') return {};
      throw new Error(`Modulo inesperado: ${nombre}`);
    },
    console: { error() {} },
  }, { filename: rutaControlador });
  async function resumen(idCajero) {
    const respuesta = {
      statusCode: 200, payload: null,
      status(codigo) { this.statusCode = codigo; return this; },
      json(datos) { this.payload = datos; return this; },
    };
    await modulo.exports.resumenCaja({ personal: { id_trabajador: idCajero } }, respuesta);
    return respuesta;
  }
  return { resumen, consultas };
}

test('API del dashboard calcula saldo general y ventas SOLO del cajero logueado', async () => {
  const backend = prepararResumenBackend();
  const r = await backend.resumen(9);
  assert.equal(r.statusCode, 200);
  assert.equal(r.payload.data.cuentas_pendientes, 3);
  assert.equal(r.payload.data.cuentas_listas, 1);
  assert.equal(r.payload.data.solicitudes_cuenta, 1);
  assert.equal(r.payload.data.monto_pendiente, 80);
  assert.equal(r.payload.data.pagos_hoy_cajero, 3);
  assert.equal(r.payload.data.total_hoy_cajero, 65);
  const pagos = backend.consultas.find((q) => /GROUP BY metodo_pago/.test(q.sql));
  assert.equal(Array.from(pagos.params).join(","), "9");
});

test('API del dashboard no atribuye a otro cajero los pagos del primero', async () => {
  const backend = prepararResumenBackend();
  const r = await backend.resumen(42);
  assert.equal(r.statusCode, 200);
  assert.equal(r.payload.data.cuentas_pendientes, 3);
  assert.equal(r.payload.data.monto_pendiente, 80);
  assert.equal(r.payload.data.pagos_hoy_cajero, 0);
  assert.equal(r.payload.data.total_hoy_cajero, 0);
});
