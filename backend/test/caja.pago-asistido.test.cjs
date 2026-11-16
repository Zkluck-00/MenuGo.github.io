'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const PATH_JS = path.join(ROOT, 'Frontend/js/caja-pago-asistido.js');
const leer = (ruta) => fs.readFileSync(path.join(ROOT, ruta), 'utf8');
const asistido = require(PATH_JS);
const cuenta = {
  etiqueta: 'Mesa 7',
  detalles: [
    { id_detalle_producto: 11, nombre: 'Aeropuerto (Carne)' },
    { id_detalle_producto: 12, nombre: 'Aeropuerto (Carne)' },
    { id_detalle_producto: 13, nombre: '<img src=x onerror=alert(1)>' },
  ],
};

function entorno() {
  const oyentes = {};
  const seleccionados = [
    { dataset: { id: '11', monto: '20.00' } },
    { dataset: { id: '12', monto: '20.00' } },
  ];
  const contenidoTicket = { innerHTML: '' };
  const contenedorPagos = {
    children: [],
    querySelector() { return null; },
    appendChild(el) { this.children.push(el); },
  };
  const seccion = { children: [], appendChild(el) { this.children.push(el); } };
  const base = {
    querySelector(q) { return q === 'section' ? seccion : null; },
    addEventListener(nombre, fn) { oyentes[nombre] = fn; },
    removeEventListener(nombre) { delete oyentes[nombre]; },
  };
  const imagenQr = {
    complete: false, naturalWidth: 0, src: '../img/qr-yape-comercio.png',
    addEventListener(nombre, fn) { oyentes[`imagen:${nombre}`] = fn; },
    classList: { add() {} },
  };
  const confirmacion = { checked: false };
  const referencia = { value: '' };
  const metodo = { value: 'Efectivo' };
  const elementos = {
    'contenido-cobro': base,
    'contenido-ticket-previo-caja': contenidoTicket,
    'campos-pago-caja': contenedorPagos,
    'metodo-cobro-caja': metodo,
    'comprobante-caja': { value: 'boleta' },
    'pagado-por-caja': { value: 'Cliente' },
    'documento-caja': { value: '12345678' },
    'confirmacion-externa-caja': confirmacion,
    'referencia-pago-caja': referencia,
    'codigo-yape-caja': imagenQr,
    'tipo-codigo-yape-caja': { textContent: '', className: '' },
    'importe-yape-caja': { textContent: '' },
    'importe-pos-caja': { textContent: '' },
    'estado-pos-caja': { textContent: '' },
  };
  const document = {
    getElementById(id) { return elementos[id] || null; },
    querySelectorAll(query) { return query === '.item-cobro-caja:checked' ? seleccionados : []; },
    querySelector() { return { disabled: true }; },
    createElement() { return { innerHTML: '', dataset: {}, className: '' }; },
  };
  const contexto = vm.createContext({
    window: { MENUGO_PERSONAL_BLOQUEADO: false },
    document,
    console,
  });
  vm.runInContext(fs.readFileSync(PATH_JS, 'utf8'), contexto, { filename: 'caja-pago-asistido.js' });
  return { api: contexto.window.MenuGoCobroAsistido, elementos, seleccionados, oyentes, contenedorPagos, seccion };
}

test('modelo del ticket previo agrupa productos repetidos y suma en centimos', () => {
  const m = asistido.modeloTicketPrevio(cuenta, [
    { id_detalle_producto: 11, monto: '20.00' },
    { id_detalle_producto: 12, monto: '20.00' },
  ], { tipo: 'boleta', metodo: 'Yape' });
  assert.equal(m.totalCentavos, 4000);
  assert.equal(m.lineas.length, 1);
  assert.equal(m.lineas[0].cantidad, 2);
  assert.equal(m.lineas[0].importe, 4000);
  assert.equal(m.tipo, 'BOLETA INTERNA');
});

test('la vista previa marca no emitido y escapa datos recibidos', () => {
  const e = entorno();
  e.api.iniciar(cuenta);
  assert.match(e.elementos['contenido-ticket-previo-caja'].innerHTML, /VISTA PREVIA.*NO EMITIDO/);
  assert.match(e.elementos['contenido-ticket-previo-caja'].innerHTML, /S\/ 40\.00/);
  assert.match(e.elementos['contenido-ticket-previo-caja'].innerHTML, /Logo MenuGo/);
  e.seleccionados.push({ dataset: { id: '13', monto: '1.00' } });
  e.api.actualizarVistaPrevia();
  assert.match(e.elementos['contenido-ticket-previo-caja'].innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(e.elementos['contenido-ticket-previo-caja'].innerHTML, /<img src=x onerror/);
});

test('Yape solicita referencia y confirmacion de pago real, no solo QR', () => {
  const e = entorno();
  e.api.iniciar(cuenta);
  e.elementos['metodo-cobro-caja'].value = 'Yape';
  e.api.mostrarMetodo('Yape');
  const panel = e.contenedorPagos.children.at(-1).innerHTML;
  assert.match(panel, /qr-yape-comercio\.png/);
  assert.match(panel, /confirmacion-externa-caja/);
  assert.equal(e.api.puedeRegistrar('Yape'), false);
  e.elementos['referencia-pago-caja'].value = 'YAPE-REC-789';
  assert.equal(e.api.puedeRegistrar('Yape'), false);
  e.elementos['confirmacion-externa-caja'].checked = true;
  assert.equal(e.api.puedeRegistrar('Yape'), true);
});

test('si cambia el total, retira la confirmacion externa para evitar cobro con monto distinto', () => {
  const e = entorno();
  e.api.iniciar(cuenta);
  e.elementos['metodo-cobro-caja'].value = 'Yape';
  e.api.mostrarMetodo('Yape');
  e.elementos['referencia-pago-caja'].value = 'OP123';
  e.elementos['confirmacion-externa-caja'].checked = true;
  assert.equal(e.api.puedeRegistrar('Yape'), true);
  e.seleccionados.pop();
  e.api.actualizarVistaPrevia();
  assert.equal(e.api.puedeRegistrar('Yape'), false);
});

test('POS se presenta como simulacion y no confirma automaticamente tarjeta', () => {
  const e = entorno();
  e.api.iniciar(cuenta);
  e.elementos['metodo-cobro-caja'].value = 'Tarjeta credito';
  e.api.mostrarMetodo('Tarjeta credito');
  const panel = e.contenedorPagos.children.at(-1).innerHTML;
  assert.match(panel, /Simular tarjeta/);
  assert.match(panel, /Simular aprobaci[oó]n/);
  assert.match(panel, /NO procesa ni autoriza tarjetas/);
  e.elementos['referencia-pago-caja'].value = 'POS-APPROVED-1';
  assert.equal(e.api.puedeRegistrar('Tarjeta credito'), false);
  e.elementos['confirmacion-externa-caja'].checked = true;
  assert.equal(e.api.puedeRegistrar('Tarjeta credito'), true);
});

test('si falta el QR del comercio, muestra el QR demo claramente no cobrable', () => {
  const e = entorno();
  e.api.iniciar(cuenta);
  e.api.mostrarMetodo('Yape');
  e.oyentes['imagen:error']();
  assert.equal(e.elementos['codigo-yape-caja'].src, '../img/qr-yape-demo.png');
  e.oyentes['imagen:load']();
  assert.match(e.elementos['tipo-codigo-yape-caja'].textContent, /DEMO.*No recibe dinero/);
});

test('los botones demo de POS no habilitan el registro sin verificacion humana', () => {
  const e = entorno();
  e.api.iniciar(cuenta);
  e.api.mostrarMetodo('Tarjeta debito');
  e.oyentes.click({ target: { closest() { return { dataset: { demoPos: 'lectura' } }; } }, preventDefault() {} });
  assert.match(e.elementos['estado-pos-caja'].textContent, /tarjeta detectada/);
  e.oyentes.click({ target: { closest() { return { dataset: { demoPos: 'aprobacion' } }; } }, preventDefault() {} });
  assert.match(e.elementos['estado-pos-caja'].textContent, /SIMULADA/);
  assert.equal(e.elementos['confirmacion-externa-caja'].checked, false);
  assert.equal(e.api.puedeRegistrar('Tarjeta debito'), false);
});

test('efectivo conserva su validacion existente sin requerir terminal ni codigo', () => {
  const e = entorno();
  e.api.iniciar(cuenta);
  assert.equal(e.api.puedeRegistrar('Efectivo'), true);
  assert.equal(e.api.puedeRegistrar('Tarjeta debito'), false);
});

test('el modulo asistido no hace cobros HTTP y el backend sigue decidiendo el ticket real', () => {
  const js = leer('Frontend/js/caja-pago-asistido.js');
  const caja = leer('Frontend/js/caja.js');
  assert.doesNotMatch(js, /\bfetch\s*\(/);
  assert.doesNotMatch(js, /\bmethod\s*:\s*['"]POST['"]/);
  assert.match(caja, /prepararIntentoPagoCaja\(/);
  assert.match(caja, /window\.MenuGoCobroAsistido\?\.motivoNoRegistrable\(metodo\)/);
  assert.match(caja, /window\.MenuGoTicket\?\.ofrecerImpresion\(registro\.data/);
  assert.ok(caja.indexOf('window.MenuGoTicket?.ofrecerImpresion(registro.data') > caja.indexOf('cobroConfirmado = true'));
});

test('HTML carga el complemento antes que caja.js y el QR demo esta disponible', () => {
  const html = leer('Frontend/Cajero/cajero.html');
  assert.ok(html.indexOf('caja-pago-asistido.js') < html.indexOf('src="../js/caja.js"'));
  const imagen = path.join(ROOT, 'Frontend/img/qr-yape-demo.png');
  const buf = fs.readFileSync(imagen);
  assert.deepEqual([...buf.subarray(0,8)], [137,80,78,71,13,10,26,10]);
});
