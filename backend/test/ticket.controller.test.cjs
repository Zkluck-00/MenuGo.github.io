'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough, Readable } = require('node:stream');

const servicio = require('../src/services/ticket-pdf.service');
const moduloDB = require.resolve('../src/config/db');
const moduloServicio = require.resolve('../src/services/ticket-pdf.service');
const moduloController = require.resolve('../src/controllers/ticket.controller');
const backupDB = require.cache[moduloDB];
const backupServicio = require.cache[moduloServicio];

let pago = {
  id_pago: 125, id_cuenta: 34, id_cajero: 5, estado_pago: 'pagado',
  monto: '69.00', metodo_pago: 'yape', fecha_pago: '2026-11-15T20:00:00Z',
  pagado_por: 'Cliente', mesas: '1', tipo_comprobante: 'boleta', dni: '12345678',
};
let detalles = [
  { id_detalle_producto: 8, nombre_producto: 'Tiradito Nikei', monto_pagado: '35.00', subtotal_producto: '35.00', cantidad_pedido: 1 },
  { id_detalle_producto: 9, nombre_producto: 'Tiradito amarillo', monto_pagado: '34.00', subtotal_producto: '34.00', cantidad_pedido: 1 },
];
let errorSQL = false;
let errorPDF = false;
const consultas = [];

class StubPDF extends Readable {
  _read() {}
  end() { this.push(Buffer.from('%PDF-FAKE')); this.push(null); }
}
require.cache[moduloDB] = {
  id: moduloDB, filename: moduloDB, loaded: true,
  exports: { cajeroPool: { async query(sql, params) {
    consultas.push({ sql, params });
    if (errorSQL) throw new Error('Base de datos no disponible');
    if (sql.includes('FROM pagos pg')) return { rows: pago ? [pago] : [] };
    if (sql.includes('FROM detalle_pago dpg')) return { rows: detalles };
    throw new Error('Consulta SQL inesperada');
  } } },
};
require.cache[moduloServicio] = {
  id: moduloServicio, filename: moduloServicio, loaded: true,
  exports: { ...servicio, crearDocumentoTicket() {
    if (errorPDF) throw new Error('PDFKit no instalado');
    return new StubPDF();
  } },
};
delete require.cache[moduloController];
const { descargarTicketPDF, idPositivo, SQL_PAGO, SQL_DETALLES } = require(moduloController);

class Respuesta extends PassThrough {
  constructor() {
    super();
    this.statusCode = 200;
    this.cabeceras = {};
    this.cuerpo = null;
    this.bytes = [];
    this.on('data', (x) => this.bytes.push(x));
  }
  status(codigo) { this.statusCode = codigo; return this; }
  setHeader(k, v) { this.cabeceras[k.toLowerCase()] = v; return this; }
  json(body) { this.cuerpo = body; this.end(); return this; }
}

async function invocar({ id = '125', ancho, descargar, personal = { rol: 'cajero', id_trabajador: 5 } } = {}) {
  const res = new Respuesta();
  await descargarTicketPDF({ params: { id }, query: { ancho, descargar }, personal }, res);
  if (!res.writableFinished) {
    await new Promise((resolve, reject) => { res.once('finish', resolve); res.once('error', reject); });
  }
  return res;
}

function reiniciar() {
  consultas.length = 0;
  errorSQL = false;
  errorPDF = false;
  pago = { id_pago: 125, id_cuenta: 34, id_cajero: 5, estado_pago: 'pagado', monto: '69.00', metodo_pago: 'yape', fecha_pago: '2026-11-15T20:00:00Z', pagado_por: 'Cliente', mesas: '1', tipo_comprobante: 'boleta', dni: '12345678' };
  detalles = [
    { id_detalle_producto: 8, nombre_producto: 'Tiradito Nikei', monto_pagado: '35.00', subtotal_producto: '35.00', cantidad_pedido: 1 },
    { id_detalle_producto: 9, nombre_producto: 'Tiradito amarillo', monto_pagado: '34.00', subtotal_producto: '34.00', cantidad_pedido: 1 },
  ];
}

test('21: IDs validos y no inyectables en consultas', () => {
  assert.equal(idPositivo('125'), 125);
  for (const id of ['0', '-1', '1 OR 1=1', '1.0', '999999999999999999999', 'abc']) {
    assert.equal(idPositivo(id), null);
  }
  assert.match(SQL_PAGO, /WHERE pg\.id_pago = \$1/);
  assert.match(SQL_DETALLES, /WHERE dpg\.id_pago = \$1/);
});

test('21: PDF inline de 80 mm se genera solo con SELECT parametrizados', async () => {
  reiniciar();
  const res = await invocar();
  assert.equal(res.statusCode, 200);
  assert.equal(res.cabeceras['content-type'], 'application/pdf');
  assert.match(res.cabeceras['content-disposition'], /^inline; filename="menugo-ticket-pago-125-80mm\.pdf"$/);
  assert.match(res.cabeceras['cache-control'], /no-store/);
  assert.equal(Buffer.concat(res.bytes).toString(), '%PDF-FAKE');
  assert.equal(consultas.length, 2);
  assert.ok(consultas.every((q) => /^\s*SELECT/i.test(q.sql)));
  assert.deepEqual(consultas.map((q) => q.params), [[125], [125]]);
});

test('21: permite descargar papel 58mm sin generar segundo cobro', async () => {
  reiniciar();
  const res = await invocar({ ancho: '58', descargar: '1' });
  assert.match(res.cabeceras['content-disposition'], /^attachment; filename="menugo-ticket-pago-125-58mm\.pdf"$/);
  assert.ok(consultas.every((q) => !/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(q.sql)));
});

test('21: error 400 por id o ancho invalido sin tocar BD', async () => {
  reiniciar();
  const a = await invocar({ id: '../secret' });
  assert.equal(a.statusCode, 400);
  const b = await invocar({ ancho: '100' });
  assert.equal(b.statusCode, 400);
  const c = await invocar({ descargar: 'true' });
  assert.equal(c.statusCode, 400);
  assert.equal(consultas.length, 0);
});

test('21: error 404 cuando el pago no existe o no esta pagado', async () => {
  reiniciar();
  pago = null;
  assert.equal((await invocar()).statusCode, 404);
  pago = { id_pago: 125, estado_pago: 'pendiente' };
  assert.equal((await invocar()).statusCode, 404);
  assert.equal(consultas.length, 2);
});

test('21: un cajero no obtiene tickets de otro cajero', async () => {
  reiniciar();
  const res = await invocar({ personal: { rol: 'cajero', id_trabajador: 7 } });
  assert.equal(res.statusCode, 403);
  assert.equal(consultas.length, 1);
});

test('21: administrador puede consultar el pago historico de cajero sin ID', async () => {
  reiniciar();
  pago.id_cajero = null;
  const res = await invocar({ personal: { rol: 'administrador', id_trabajador: null } });
  assert.equal(res.statusCode, 200);
});

test('21: falta de detalles / saldo inconsistente devuelve 409, nunca PDF ficticio', async () => {
  reiniciar();
  detalles = [];
  assert.equal((await invocar()).statusCode, 409);
  detalles = [{ ...detalles[0], id_detalle_producto: 8, monto_pagado: '1.00', subtotal_producto: '35.00' }];
  assert.equal((await invocar()).statusCode, 409);
});

test('21: no filtra excepciones SQL al cliente', async () => {
  reiniciar();
  errorSQL = true;
  const res = await invocar();
  assert.equal(res.statusCode, 500);
  assert.ok(!JSON.stringify(res.cuerpo).includes('Base de datos no disponible'));
});

test('21: si falta PDFKit se informa 503, no se altera PostgreSQL', async () => {
  reiniciar();
  errorPDF = true;
  const res = await invocar();
  assert.equal(res.statusCode, 503);
  assert.equal(consultas.length, 2);
});

test.after(() => {
  delete require.cache[moduloController];
  if (backupDB) require.cache[moduloDB] = backupDB;
  else delete require.cache[moduloDB];
  if (backupServicio) require.cache[moduloServicio] = backupServicio;
  else delete require.cache[moduloServicio];
});
