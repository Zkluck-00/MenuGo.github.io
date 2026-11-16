'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const servicio = require('../src/services/ticket-pdf.service');

const pagoEjemplo = {
  id_pago: 125, id_cuenta: 34, id_comprobante: 98,
  estado_pago: 'pagado', monto: '69.00', metodo_pago: 'yape',
  referencia: 'OP123', fecha_pago: '2026-11-15T20:00:00Z',
  pagado_por: 'Cliente', nombre_grupo: 'Mesa 1', mesas: '1',
  cajero_nombre: 'Cajero Demo', tipo_comprobante: 'boleta', dni: '12345678',
};
const productos = [
  { id_detalle_producto: 10, nombre_producto: 'Tiradito Nikei', monto_pagado: '35.00', subtotal_producto: '35.00', cantidad_pedido: 1 },
  { id_detalle_producto: 11, nombre_producto: 'Tiradito amarillo', monto_pagado: '34.00', subtotal_producto: '34.00', cantidad_pedido: 1 },
];

class FakePDF extends Readable {
  static instancias = [];
  constructor(opciones) {
    super();
    this.opciones = opciones;
    this.trazos = [];
    FakePDF.instancias.push(this);
  }
  _read() {}
  font(valor) { this.trazos.push(['font', valor]); return this; }
  fontSize(valor) { this.trazos.push(['size', valor]); return this; }
  image(ruta) { this.trazos.push(['image', String(ruta)]); return this; }
  fillColor() { return this; }
  strokeColor() { return this; }
  lineWidth() { return this; }
  moveTo() { return this; }
  lineTo() { return this; }
  stroke() { return this; }
  heightOfString(texto, options) {
    const ancho = options.width || 130;
    const bloques = Math.max(1, Math.ceil(String(texto).length * 4.4 / ancho));
    return bloques * 10;
  }
  text(valor) { this.trazos.push(['text', String(valor)]); return this; }
  end() { this.push(Buffer.from('%PDF-FAKE')); this.push(null); }
}

test('21: formatos PDF 58 y 80 mm; predeterminado 80', () => {
  assert.equal(servicio.validarAncho(), 80);
  assert.equal(servicio.validarAncho('58'), 58);
  assert.equal(servicio.validarAncho(80), 80);
  for (const invalido of ['0', '57', '82', 'abc', '-58', '58,80']) {
    assert.throws(() => servicio.validarAncho(invalido), /58 u 80/);
  }
});

test('21: dinero exacto en centimos sin usar el subtotal del navegador', () => {
  assert.equal(servicio.centavos('69.00'), 6900);
  assert.equal(servicio.centavos('0.05'), 5);
  assert.equal(servicio.centavos('12.3'), 1230);
  assert.equal(servicio.solesCentavos(6900), 'S/ 69.00');
  for (const invalido of ['5.999', '1e3', '-1.00', 'NaN', '12,30', '']) {
    assert.throws(() => servicio.centavos(invalido));
  }
});

test('21: ticket se basa en importe y productos del pago guardado', () => {
  const ticket = servicio.prepararTicket(pagoEjemplo, productos);
  assert.equal(ticket.totalCentavos, 6900);
  assert.equal(ticket.lineas.length, 2);
  assert.equal(ticket.lineas[0].importeCentavos, 3500);
  assert.equal(ticket.lineas[1].importeCentavos, 3400);
  assert.equal(ticket.documentoCliente, '12345678');
  assert.equal(ticket.idComprobante, 98);
  assert.match(ticket.fecha, /15\/11\/2026/);
});

test('21: en cuentas divididas NO afirma que se pago la cantidad completa', () => {
  const pago = { ...pagoEjemplo, monto: '15.00', participante: 'Ana' };
  const detalle = [{ ...productos[0], monto_pagado: '15.00' }];
  const ticket = servicio.prepararTicket(pago, detalle);
  assert.equal(ticket.lineas[0].descripcion, 'Pago parcial');
  assert.equal(ticket.participante, 'Ana');
});

test('21: el desglose debe coincidir centimo a centimo con pagos.monto', () => {
  assert.throws(() => servicio.prepararTicket({ ...pagoEjemplo, monto: '70.00' }, productos), /no coincide/);
  assert.throws(() => servicio.prepararTicket(pagoEjemplo, []), /no tiene/);
  assert.throws(() => servicio.prepararTicket({ ...pagoEjemplo, estado_pago: 'pendiente' }, productos), /confirmados/);
  assert.throws(() => servicio.prepararTicket(pagoEjemplo, [{ ...productos[0], monto_pagado: '36.00' }]), /inconsistente/);
});

test('21: efectivo y vuelto se verifican con importes registrados', () => {
  const efectivo = { ...pagoEjemplo, metodo_pago: 'efectivo', monto_recibido: '70.00', vuelto: '1.00' };
  const ticket = servicio.prepararTicket(efectivo, productos);
  assert.equal(ticket.recibido, 7000);
  assert.equal(ticket.vuelto, 100);
  assert.throws(() => servicio.prepararTicket({ ...efectivo, vuelto: '3.00' }, productos), /no coinciden/);
});

test('21: metadatos no incluyen saltos de linea ni caracteres de control', () => {
  const ticket = servicio.prepararTicket({ ...pagoEjemplo, pagado_por: 'Ana\r\nINYECCION\t \u0001' }, productos);
  assert.equal(ticket.pagadoPor, 'Ana INYECCION ?');
});

test('21: layout termico dibuja el ticket sin paginacion A4', () => {
  FakePDF.instancias.length = 0;
  const ticket = servicio.prepararTicket(pagoEjemplo, productos);
  const doc58 = servicio.crearDocumentoTicket(ticket, 58, FakePDF);
  const [measure58, final58] = FakePDF.instancias;
  assert.ok(Math.abs(final58.opciones.size[0] - 164.4) < 1);
  assert.ok(final58.opciones.size[1] >= 180);
  assert.equal(doc58, final58);
  const textos = final58.trazos.filter((x) => x[0] === 'text').map((x) => x[1]).join(' | ');
  for (const termino of ['TICKET INTERNO', 'SUNAT', 'Tiradito Nikei', 'Tiradito amarillo', '69.00', 'OP123']) {
    assert.ok(textos.includes(termino), `Falta ${termino}`);
  }
  assert.ok(measure58.opciones.size[0] > 160);
  assert.ok(final58.trazos.some(x => x[0] === 'image' && x[1].endsWith('logo-menugo-ticket.png')), 'El PDF de 58 mm incluye el logo MenuGo');
  FakePDF.instancias.length = 0;
  const doc80 = servicio.crearDocumentoTicket(ticket, '80', FakePDF);
  assert.ok(Math.abs(doc80.opciones.size[0] - 226.77) < 1);
  assert.ok(FakePDF.instancias[1].trazos.some(x => x[0] === 'image'), 'El PDF de 80 mm incluye el logo');
});

test('21: la ruta del ticket es GET, protegida por autenticacion previa y no cobra de nuevo', () => {
  const ruta = fs.readFileSync(path.join(__dirname, '../src/routes/cajero.routes.js'), 'utf8');
  assert.match(ruta, /router\.use\(autenticarPersonal, autorizarRoles\('cajero', 'administrador'\)\)/);
  assert.match(ruta, /router\.get\('\/pagos\/:id\/ticket\.pdf', ticketController\.descargarTicketPDF\)/);
  assert.doesNotMatch(ruta, /router\.post\('\/pagos\/:id\/ticket\.pdf'/);
});
