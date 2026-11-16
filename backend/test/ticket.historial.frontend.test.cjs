'use strict';

// Commit 23: verificacion de historiales + impresion sin crear pagos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const leer = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const script = leer('Frontend/js/historial-tickets.js');
const util = require(path.join(ROOT, 'Frontend/js/historial-tickets.js'));

function elemento(id = '') {
  const eventos = new Map();
  const clases = new Set(['hidden']);
  const sub = new Map();
  const el = {
    id, dataset: {}, value: '', textContent: '', src: '', href: '', download: '', innerHTML: '', disabled: false,
    appendChild() {}, click() { el.clicked = true; }, focus() { el.focused = true; }, remove() { el.removed = true; },
    setAttribute() {},
    classList: {
      add(...xs) { xs.forEach(x => clases.add(x)); },
      remove(...xs) { xs.forEach(x => clases.delete(x)); },
      contains(x) { return clases.has(x); },
    },
    addEventListener(nombre, fn) { eventos.set(nombre, fn); },
    emit(nombre, evento = {}) { return eventos.get(nombre)?.(evento); },
    querySelector(sel) {
      if (!sub.has(sel)) sub.set(sel, elemento(sel));
      return sub.get(sel);
    },
    contains(el2) { return Boolean(el2); },
  };
  return el;
}

function entorno(opciones = {}) {
  const callbacks = new Map(), listeners = new Map(), fetches = [], revocados = [], creados = [], opened = [];
  const anexados = [], elementos = {};
  const body = { appendChild(el) { anexados.push(el); return el; } };
  const doc = {
    body,
    createElement(tag) { return elemento(tag); },
    getElementById(id) { if (!elementos[id]) elementos[id] = elemento(id); return elementos[id]; },
    addEventListener(nombre, fn) { callbacks.set(nombre, fn); },
  };
  const url = {
    createObjectURL(blob) { const x = `blob:https://menugo.local/${creados.length + 1}`; assert(blob.size > 0); creados.push(x); return x; },
    revokeObjectURL(x) { revocados.push(x); },
  };
  const window = {
    MENUGO_PERSONAL_BLOQUEADO: false,
    MENUGO_API: 'http://localhost:4000/api',
    obtenerTokenPersonal: () => opciones.token === undefined ? 'session-test' : opciones.token,
    headersAutenticadosPersonal: (_rol, extras) => ({ ...extras, Authorization: 'Bearer session-test' }),
    URL: url,
    location: { pathname: '/Cajero/historial_pagos.html', assign(destino) { this.destino = destino; }, replace(destino) { this.reemplazo = destino; } },
    localStorage: { removeItem(clave) { this.eliminado = clave; } },
    open(urlPdf, target) { opened.push({urlPdf,target}); return opciones.bloquearPopup ? null : {opener:'pagina'}; },
    MenuGoTicket: {
      validarIdPago: val => util.idPagoValido(val),
      rutaImpresora: (id, volver) => `impresora_virtual.html?pago=${id}&volver=${volver}`,
    },
    addEventListener(nombre, fn) { listeners.set(nombre, fn); },
    fetch: async (urlPdf, params) => {
      fetches.push({ urlPdf, params });
      if (opciones.responder) return opciones.responder(urlPdf, params);
      return {
        status: 200, ok: true,
        headers: { get() { return 'application/pdf'; } },
        blob: async () => new Blob(['%PDF-1.7\nexample'], { type: 'application/pdf' }),
      };
    },
  };
  vm.runInNewContext(script, { window, document: doc, AbortController, Blob, URLSearchParams }, { filename: 'historial-tickets.js' });
  return { window, doc, elementos, anexados, callbacks, listeners, fetches, revocados, creados, opened, api: window.MenuGoHistorialTicket };
}

async function completar() {
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

// Funciones puras, rutas seguras y contratos de solo lectura.
test('23: valida numeros positivos y rechaza IDs manipulados', () => {
  assert.equal(util.idPagoValido('142'), 142);
  for (const valor of ['', '0', '0001', '-2', '1/..', '123?test', '1e3', '<script>', '9999999999999']) {
    assert.equal(util.idPagoValido(valor), null, String(valor));
  }
});

test('23: la ruta PDF usa 58 u 80 mm y conserva el ID de pago', () => {
  assert.equal(util.rutaPdf('/api/', 42, 58), '/api/cajero/pagos/42/ticket.pdf?ancho=58');
  assert.equal(util.rutaPdf('/api', 42, 80), '/api/cajero/pagos/42/ticket.pdf?ancho=80');
  assert.throws(() => util.rutaPdf('/api', 42, 74), /ancho/i);
  assert.throws(() => util.rutaPdf('/api', '1;DROP', 80), /identificador/i);
});

test('23: los destinos externos son descartados y la ruta queda dentro del Cajero', () => {
  assert.equal(util.retornoValido('facturacion.html'), 'facturacion.html');
  assert.equal(util.retornoValido('historial_pagos.html'), 'historial_pagos.html');
  assert.equal(util.retornoValido('https://evil.example'), 'historial_pagos.html');
  assert.equal(util.retornoValido('../admin/login.html'), 'historial_pagos.html');
  const env = entorno();
  assert.equal(env.api.rutaTicket(12, 'https://evil.example'), 'impresora_virtual.html?pago=12&volver=historial_pagos.html');
});

test('23: el simulador acepta ambos historiales y conserva la lista blanca', () => {
  const ticket = require(path.join(ROOT, 'Frontend/js/ticket-virtual.js'));
  assert.equal(ticket.retornoSeguro('facturacion.html'), 'facturacion.html');
  assert.equal(ticket.retornoSeguro('historial_pagos.html'), 'historial_pagos.html');
  assert.equal(ticket.retornoSeguro('https://evil.example'), 'cajero.html');
  assert.equal(ticket.retornoSeguro('../../admin.html'), 'cajero.html');
});

test('23: ambos historiales cargan el modulo antes de los scripts de pagina', () => {
  for (const [archivo, scriptPagina] of [
    ['Frontend/Cajero/facturacion.html', 'facturacion.js'],
    ['Frontend/Cajero/historial_pagos.html', 'historial-pagos.js'],
  ]) {
    const html = leer(archivo);
    assert.ok(html.includes('ticket-virtual.js'));
    assert.ok(html.includes('historial-tickets.js'));
    assert.ok(html.indexOf('ticket-virtual.js') < html.indexOf('historial-tickets.js'));
    assert.ok(html.indexOf('historial-tickets.js') < html.indexOf(scriptPagina));
    assert.ok(html.includes('personal-auth.js'));
  }
});

test('23: la vista previa no tiene operaciones de pago ni SQL ni JWT en parametros', () => {
  assert.match(script, /method: 'GET'/);
  assert.doesNotMatch(script, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
  assert.doesNotMatch(script, /localStorage\.setItem\(/);
  assert.doesNotMatch(script, /\.query\(\s*['"`]?(?:INSERT|UPDATE|DELETE)/i);
  assert.doesNotMatch(script, /\/ticket\.pdf\?token=/i);
});

// Simulacion de flujo de vista previa + PDF.
test('23: abrir vista previa consulta el PDF con JWT sin ejecutar POST', async () => {
  const env = entorno();
  assert.equal(env.api.abrirVistaPrevia(56), true);
  await completar();
  assert.equal(env.fetches.length, 1);
  assert.equal(env.fetches[0].params.method, 'GET');
  assert.equal(env.fetches[0].params.cache, 'no-store');
  assert.equal(env.fetches[0].params.headers.Authorization, 'Bearer session-test');
  assert.match(env.fetches[0].urlPdf, /\/cajero\/pagos\/56\/ticket\.pdf\?ancho=80$/);
  assert.ok(!env.fetches[0].urlPdf.includes('session-test'));
  assert.equal(env.creados.length, 1);
  const modal = env.anexados[0];
  assert.equal(modal.querySelector('#visor-vista-ticket').src, env.creados[0]);
  assert.equal(modal.querySelector('#descargar-vista-ticket').disabled, false);
  assert.equal(modal.querySelector('#referencia-vista-ticket').textContent, 'Pago registrado #56 · Solo lectura');
});

test('23: sin pago valido no crea un PDF ni un modal falso', () => {
  const env = entorno();
  assert.equal(env.api.abrirVistaPrevia('abc'), false);
  assert.equal(env.anexados.length, 0);
  assert.equal(env.fetches.length, 0);
});

test('23: sin sesion no consulta el endpoint y muestra error', async () => {
  const env = entorno({ token: '' });
  env.api.abrirVistaPrevia(77);
  await completar();
  assert.equal(env.fetches.length, 0);
  assert.match(env.anexados[0].querySelector('#estado-vista-ticket').textContent, /iniciar sesion/i);
});

test('23: un 403 no produce PDF ni habilita imprimir', async () => {
  const env = entorno({ responder: async () => ({ ok: false, status: 403, json: async () => ({message:'Sin permiso de cajero'}) }) });
  env.api.abrirVistaPrevia(17);
  await completar();
  const modal = env.anexados[0];
  assert.equal(env.creados.length, 0);
  assert.equal(modal.querySelector('#descargar-vista-ticket').disabled, true);
  assert.match(modal.querySelector('#estado-vista-ticket').textContent, /Sin permiso/);
});

test('23: un 404 informa el error y no inventa ticket', async () => {
  const env = entorno({ responder: async () => ({ ok: false, status: 404, json: async () => ({}) }) });
  env.api.abrirVistaPrevia(17);
  await completar();
  assert.match(env.anexados[0].querySelector('#estado-vista-ticket').textContent, /no existe/i);
  assert.equal(env.creados.length, 0);
});

test('23: un 401 invalida sesion de cajero y dirige a login', async () => {
  const env = entorno({ responder: async () => ({ ok: false, status: 401, json: async () => ({message:'Acceso expirado'}) }) });
  env.api.abrirVistaPrevia(17);
  await completar();
  assert.equal(env.window.localStorage.eliminado, 'menugo_cajero_sesion');
  assert.equal(env.window.location.reemplazo, 'login.html?access=required');
  assert.equal(env.creados.length, 0);
});

test('23: respuesta HTML no se trata como PDF', async () => {
  const env = entorno({ responder: async () => ({ ok: true, headers: {get:()=>'text/html'}, blob: async()=>new Blob(['bad']) }) });
  env.api.abrirVistaPrevia(17);
  await completar();
  assert.equal(env.creados.length, 0);
  assert.match(env.anexados[0].querySelector('#estado-vista-ticket').textContent, /no corresponde a un PDF/i);
});

test('23: el cambio de ancho cancela la carga anterior y revoca la URL', async () => {
  const env = entorno();
  env.api.abrirVistaPrevia(30); await completar();
  const modal = env.anexados[0];
  const actual = modal.querySelector('#ancho-vista-ticket'); actual.value = '58';
  actual.emit('change'); await completar();
  assert.equal(env.fetches.length, 2);
  assert.match(env.fetches[1].urlPdf, /ancho=58$/);
  assert.deepEqual(env.revocados, [env.creados[0]]);
  assert.equal(modal.querySelector('#visor-vista-ticket').src, env.creados[1]);
});

test('23: cerrar el modal invalida la peticion y libera el blob', async () => {
  const env = entorno();
  env.api.abrirVistaPrevia(30); await completar();
  env.anexados[0].querySelector('#cerrar-vista-ticket').emit('click');
  assert.equal(env.anexados[0].removed, true);
  assert.deepEqual(env.revocados, env.creados);
});

test('23: descargar crea un nombre local de ticket y no realiza consultas extra', async () => {
  const env = entorno();
  env.api.abrirVistaPrevia(55); await completar();
  env.anexados[0].querySelector('#descargar-vista-ticket').emit('click');
  const link = env.anexados.find(x => x.download);
  assert.equal(link.download, 'menugo-ticket-pago-55-80mm.pdf');
  assert.equal(link.href, env.creados[0]);
  assert.equal(link.clicked, true);
  assert.equal(env.fetches.length, 1);
});

test('23: imprimir abre blob PDF del pago existente en otra pestana', async () => {
  const env = entorno();
  env.api.abrirVistaPrevia(55); await completar();
  env.anexados[0].querySelector('#imprimir-vista-ticket').emit('click');
  assert.deepEqual(env.opened, [{urlPdf:env.creados[0],target:'_blank'}]);
  assert.equal(env.fetches.length, 1);
});

test('23: popup bloqueado informa error sin registrar otra operacion', async () => {
  const env = entorno({bloquearPopup:true});
  env.api.abrirVistaPrevia(55); await completar();
  env.anexados[0].querySelector('#imprimir-vista-ticket').emit('click');
  assert.match(env.anexados[0].querySelector('#estado-vista-ticket').textContent, /bloqueo/i);
});

test('23: simular reimpresion devuelve al historial propio', async () => {
  const env = entorno();
  env.api.abrirVistaPrevia(55); await completar();
  env.anexados[0].querySelector('#simular-vista-ticket').emit('click');
  assert.equal(env.window.location.destino, 'impresora_virtual.html?pago=55&volver=historial_pagos.html');
});

test('23: la delegacion de botones valida IDs y no se duplica', () => {
  const env = entorno();
  assert.equal(env.api.enlazarContenedor('tabla-pagos','historial_pagos.html'), true);
  assert.equal(env.api.enlazarContenedor('tabla-pagos','historial_pagos.html'), false);
  const boton = elemento('accion');
  boton.dataset = {ticketAccion:'simular', pago:'44'};
  env.elementos['tabla-pagos'].emit('click', {target:{closest:()=>boton}});
  assert.equal(env.window.location.destino, 'impresora_virtual.html?pago=44&volver=historial_pagos.html');
  boton.dataset.pago = '../../admin';
  env.window.location.destino = '';
  env.elementos['tabla-pagos'].emit('click', {target:{closest:()=>boton}});
  assert.equal(env.window.location.destino, '');
});

test('23: una segunda vista sustituye a la anterior sin conservar el primer blob', async () => {
  const env = entorno();
  env.api.abrirVistaPrevia(42); await completar();
  env.api.abrirVistaPrevia(43); await completar();
  assert.equal(env.anexados[0].removed, true);
  assert.deepEqual(env.revocados, [env.creados[0]]);
  assert.match(env.fetches[1].urlPdf, /pagos\/43\/ticket\.pdf/);
});

test('23: el historial conserva reimpresion sin vista previa redundante ni nuevas operaciones', () => {
  const pagos = leer('Frontend/js/historial-pagos.js');
  const recibos = leer('Frontend/js/facturacion.js');
  assert.match(pagos, /q\.set\('mios', '1'\)/);
  assert.doesNotMatch(pagos, /data-ticket-accion="ver"/);
  assert.match(pagos, /data-ticket-accion="simular"/);
  assert.doesNotMatch(recibos, /data-ticket-accion="ver"/);
  assert.match(recibos, /data-ticket-accion="simular"/);
  assert.doesNotMatch(pagos + recibos, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
});

test('23: el comprobante conserva la advertencia de no validez tributaria', () => {
  const html = leer('Frontend/Cajero/facturacion.html');
  assert.match(html, /SUNAT/);
  assert.match(script, /SUNAT/);
});

async function ejecutarPagina(rel, datos) {
  const eventos = new Map();
  const elementos = new Map();
  const solicitudes = [];
  const contenedor = id => {
    if (!elementos.has(id)) elementos.set(id, { id, value: '', innerHTML: '', addEventListener() {}, dataset:{} });
    return elementos.get(id);
  };
  const window = {
    MENUGO_PERSONAL_BLOQUEADO: false,
    MENUGO_API: 'http://localhost:4000/api',
    MenuGoHistorialTicket: { idPagoValido: util.idPagoValido, enlazarContenedor() {} },
  };
  const ctx = {
    window, document: {getElementById:contenedor, addEventListener:(k, fn)=>eventos.set(k, fn)},
    URLSearchParams, Date,
    headersAutenticadosPersonal: () => ({Authorization:'Bearer token-prueba'}),
    fetch: async (url, options) => {
      solicitudes.push({url, options});
      return {ok:true, json: async()=>({ok:true, data:datos})};
    },
  };
  vm.runInNewContext(leer(rel), ctx, {filename:rel});
  eventos.get('DOMContentLoaded')();
  await completar();
  return {contenedor, solicitudes};
}

test('23: historial carga solo los pagos del cajero y muestra acciones existentes', async () => {
  const env = await ejecutarPagina('Frontend/js/historial-pagos.js', [
    {id_pago:87,id_cuenta:20,fecha_pago:'2026-11-15T20:30:00Z',nombre_grupo:'Mesa 1',metodo_pago:'Efectivo',monto:'42.50',tipo_comprobante:'boleta',cajero_nombre:'Cajero Demo'},
  ]);
  assert.equal(env.solicitudes.length,1);
  assert.match(env.solicitudes[0].url,/\/cajero\/pagos\?mios=1/);
  const html=env.contenedor('tabla-pagos').innerHTML;
  assert.doesNotMatch(html,/Ver ticket/);
  assert.match(html,/Reimprimir/);
  assert.match(html,/data-pago="87"/);
  assert.match(html,/42\.50/);
});

test('23: historial escapa el texto del nombre de mesa y los IDs al renderizar', async () => {
  const env = await ejecutarPagina('Frontend/js/historial-pagos.js', [
    {id_pago:'90" onclick="alert(1)',id_cuenta:20,fecha_pago:'2026-11-15T20:30:00Z',nombre_grupo:'<img src=x onerror=alert(1)>',metodo_pago:'Efectivo',monto:'42.50'},
  ]);
  const html=env.contenedor('tabla-pagos').innerHTML;
  assert.doesNotMatch(html,/<img src=x/);
  assert.doesNotMatch(html,/data-pago="90"/);
  assert.match(html,/Sin ticket disponible/);
});

test('23: facturacion consulta comprobantes por periodo y ofrece reimpresion', async () => {
  const env = await ejecutarPagina('Frontend/js/facturacion.js', [
    {id_comprobante:7,id_pago:92,tipo_comprobante:'boleta',monto:'25.00',fecha_emision:'2026-11-15T20:30:00Z',metodo_pago:'yape',dni:'12345678'},
  ]);
  assert.match(env.solicitudes[0].url,/\/cajero\/comprobantes\?/);
  const html=env.contenedor('lista-comprobantes').innerHTML;
  assert.doesNotMatch(html,/Ver ticket PDF/);
  assert.match(html,/Reimprimir/);
  assert.match(html,/data-pago="92"/);
});

test('23: facturacion escapa razon social y no crea codigo HTML activo', async () => {
  const env = await ejecutarPagina('Frontend/js/facturacion.js', [
    {id_comprobante:9,id_pago:92,tipo_comprobante:'factura',monto:'10.00',razon_social:'<img src=x onerror=alert(1)>',metodo_pago:'yape'},
  ]);
  const html=env.contenedor('lista-comprobantes').innerHTML;
  assert.doesNotMatch(html,/<img src=x/);
  assert.match(html,/&lt;img src=x/);
});
