'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const leer = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const js = leer('Frontend/js/ticket-virtual.js');
const html = leer('Frontend/Cajero/impresora_virtual.html');
const css = leer('Frontend/css/impresora-virtual.css');
const util = require(path.join(ROOT, 'Frontend/js/ticket-virtual.js'));

function elemento(id = '') {
  const clases = new Set(['hidden']);
  const eventos = new Map();
  const el = {
    id, value: '', src: '', textContent: '', innerHTML: '', href: '', download: '', disabled: false,
    dataset: {}, offsetWidth: 201, focused: false, removed: false,
    classList: {
      add(...nombres) { nombres.forEach(x => clases.add(x)); },
      remove(...nombres) { nombres.forEach(x => clases.delete(x)); },
      contains(nombre) { return clases.has(nombre); },
    },
    addEventListener(nombre, callback) { eventos.set(nombre, callback); },
    removeEventListener(nombre) { eventos.delete(nombre); },
    emit(nombre, payload = {}) { return eventos.get(nombre)?.(payload); },
    setAttribute() {},
    focus() { el.focused = true; },
    click() { el.clicked = true; },
    remove() { el.removed = true; },
    querySelector(selector) {
      const key = selector.replace('#', '');
      if (!el.subElements) el.subElements = new Map();
      if (!el.subElements.has(key)) el.subElements.set(key, elemento(key));
      return el.subElements.get(key);
    },
  };
  return el;
}

function entorno(opciones = {}) {
  const ids = [
    'pantalla-impresora-menugo', 'enlace-volver-impresora', 'numero-pago-impresora',
    'pago-papel-impresora', 'ancho-papel-impresora', 'papel-impresora',
    'ancho-ticket-impresora', 'estado-impresora', 'visor-pdf-impresora',
    'placeholder-pdf-impresora', 'error-pdf-impresora', 'btn-reintentar-pdf-impresora',
    'btn-simular-impresora', 'btn-descargar-impresora', 'btn-imprimir-impresora',
  ];
  const elementos = Object.fromEntries(ids.map(id => [id, elemento(id)]));
  elementos['ancho-ticket-impresora'].value = '80';
  const llamadas = [], revocados = [], creados = [], ventanas = [], listeners = new Map();
  const agregados = [];
  const body = { appendChild(el) { agregados.push(el); el.parent = body; return el; } };
  const callbacks = new Map();
  const document = {
    body,
    getElementById(id) { return elementos[id] || agregados.find(el => el.id === id && !el.removed) || null; },
    createElement: tag => elemento(tag),
    addEventListener(event, cb) { callbacks.set(event, cb); },
  };
  const url = {
    createObjectURL(blob) { assert(blob.size > 0); const valor = `blob:https://menu.test/${creados.length + 1}`; creados.push(valor); return valor; },
    revokeObjectURL(item) { revocados.push(item); },
  };
  const respuestaOk = () => ({
    ok: true, status: 200,
    headers: { get: () => 'application/pdf' },
    blob: async () => new Blob(['%PDF-1.7\nprueba'], { type: 'application/pdf' }),
  });
  const ventana = { opener: 'origen' };
  const window = {
    MENUGO_API: 'http://localhost:4000/api',
    MENUGO_PERSONAL_BLOQUEADO: false,
    location: { search: opciones.search ?? '?pago=125&volver=cajero.html', replace(url) { this.redirigido = url; } },
    localStorage: { removeItem(key) { window.claveBorrada = key; } },
    obtenerTokenPersonal: () => opciones.token ?? 'token-prueba',
    headersAutenticadosPersonal: (rol, headers) => ({ ...headers, Authorization: 'Bearer token-prueba' }),
    fetch: async (url, config) => {
      llamadas.push({ url, config });
      return typeof opciones.responder === 'function' ? opciones.responder(url, config) : respuestaOk();
    },
    open: (url, dest) => { ventanas.push({ url, dest }); return opciones.popupBloqueado ? null : ventana; },
    matchMedia: () => ({ matches: opciones.movimientoReducido ?? true }),
    addEventListener: (nombre, fn) => { listeners.set(nombre, fn); },
  };
  const ctx = { window, document, AbortController, URL: url, URLSearchParams, Blob };
  vm.runInNewContext(js, ctx, { filename: 'ticket-virtual.js' });
  return { window, document, elementos, llamadas, creados, revocados, ventanas, callbacks, agregados, listeners, ventana };
}

async function completar() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

test('22: los formatos admitidos son 58 y 80 mm, y el ID de pago se valida', () => {
  assert.equal(util.validarIdPago('123'), 123);
  for (const id of ['0', '-1', '1;DROP', '1/../../admin', '0001', '1e3', '', '99999999999999']) {
    assert.equal(util.validarIdPago(id), null, String(id));
  }
  assert.match(util.rutaEndpointTicket('http://localhost:4000/api/', 123, 58), /\/api\/cajero\/pagos\/123\/ticket\.pdf\?ancho=58$/);
  assert.throws(() => util.rutaEndpointTicket('/api', 123, 59), /ancho/i);
});

test('22: la ruta de regreso admite solo Caja y Division de cuenta', () => {
  assert.equal(util.retornoSeguro('dividir_cuenta.html'), 'dividir_cuenta.html');
  assert.equal(util.retornoSeguro('https://evil.test'), 'cajero.html');
  assert.equal(util.retornoSeguro('../cajero.html'), 'cajero.html');
  assert.match(util.rutaImpresora(13, '/malicioso'), /^impresora_virtual\.html\?pago=13&volver=cajero\.html$/);
});

test('22: la interfaz incluye papel animado, vista previa y botones funcionales', () => {
  for (const id of ['papel-impresora','visor-pdf-impresora','btn-simular-impresora','btn-descargar-impresora','btn-imprimir-impresora','ancho-ticket-impresora']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(css, /@keyframes menugo-papel-salir/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(html, /NO VÁLIDO ANTE SUNAT|No sustituye una boleta/);
  assert.match(html, /Ctrl \+ P/);
  assert.match(html, /personal-auth\.js/);
});

test('22: las vistas originales conservan los scripts existentes y cargan la nueva libreria', () => {
  const cajaHTML = leer('Frontend/Cajero/cajero.html');
  const divHTML = leer('Frontend/Cajero/dividir_cuenta.html');
  for (const [html, anterior] of [[cajaHTML, 'caja.js'], [divHTML, 'subcuentas-caja.js']]) {
    assert.match(html, /ticket-virtual\.js/);
    assert.match(html, new RegExp(anterior.replace('.', '\\.') ));
    assert.ok(html.indexOf('ticket-virtual.js') < html.indexOf(anterior), 'La libreria debe cargar antes del flujo de cobro');
  }
});

test('22: ambos flujos ofrecen el ticket solo despues de respuesta exitosa', () => {
  const caja = leer('Frontend/js/caja.js');
  const split = leer('Frontend/js/subcuentas-caja.js');
  assert.match(caja, /ofrecerImpresion\(registro\.data, \{ retorno: 'cajero\.html' \}\)/);
  assert.match(split, /ofrecerImpresion\(respuesta\.data, \{ retorno: 'dividir_cuenta\.html' \}\)/);
  assert.ok(caja.indexOf('const registro = await apiCaja') < caja.indexOf('ofrecerImpresion(registro.data'));
  assert.ok(split.indexOf('const respuesta = await apiSub') < split.indexOf('ofrecerImpresion(respuesta.data'));
});

test('22: el frontend no lanza pagos ni inserciones al obtener o imprimir un ticket', () => {
  assert.match(js, /method: 'GET'/);
  assert.doesNotMatch(js, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
  assert.doesNotMatch(js, /localStorage\.setItem\([\s\S]*token/);
});

test('22: pantalla solicita el PDF autenticado y crea URL local solo con respuesta PDF', async () => {
  const env = entorno();
  env.callbacks.get('DOMContentLoaded')();
  await completar();
  assert.equal(env.llamadas.length, 1);
  assert.equal(env.llamadas[0].config.method, 'GET');
  assert.equal(env.llamadas[0].config.cache, 'no-store');
  assert.equal(env.llamadas[0].config.headers.Authorization, 'Bearer token-prueba');
  assert.match(env.llamadas[0].url, /\/pagos\/125\/ticket\.pdf\?ancho=80/);
  assert.ok(!env.llamadas[0].url.includes('token-prueba'));
  assert.equal(env.creados.length, 1);
  assert.equal(env.elementos['visor-pdf-impresora'].src, env.creados[0]);
  assert.equal(env.elementos['btn-imprimir-impresora'].disabled, false);
  assert.equal(env.elementos['papel-impresora'].classList.contains('impreso'), true);
});

test('22: cambiar ancho consulta otro PDF y libera el blob anterior', async () => {
  const env = entorno(); env.callbacks.get('DOMContentLoaded')(); await completar();
  env.elementos['ancho-ticket-impresora'].value = '58';
  env.elementos['ancho-ticket-impresora'].emit('change');
  await completar();
  assert.equal(env.llamadas.length, 2);
  assert.match(env.llamadas[1].url, /ancho=58$/);
  assert.deepEqual(env.revocados, [env.creados[0]]);
  assert.equal(env.elementos['papel-impresora'].dataset.ancho, '58');
  assert.equal(env.elementos['visor-pdf-impresora'].src, env.creados[1]);
});

test('22: descargar y abrir para imprimir utilizan el blob local, no hacen otro cobro', async () => {
  const env = entorno(); env.callbacks.get('DOMContentLoaded')(); await completar();
  env.elementos['btn-descargar-impresora'].emit('click');
  assert.ok(env.agregados.some(x => x.download === 'menugo-ticket-pago-125-80mm.pdf' && x.clicked));
  env.elementos['btn-imprimir-impresora'].emit('click');
  assert.equal(env.ventanas.length, 1);
  assert.deepEqual(env.ventanas[0], { url: env.creados[0], dest: '_blank' });
  assert.equal(env.ventana.opener, null);
  assert.equal(env.llamadas.length, 1);
});

test('22: un ID malformado bloquea la consulta y mantiene las acciones inactivas', async () => {
  const env = entorno({ search: '?pago=1%3BDROP&volver=https%3A%2F%2Fevil.test' });
  env.callbacks.get('DOMContentLoaded')(); await completar();
  assert.equal(env.llamadas.length, 0);
  assert.equal(env.elementos['btn-descargar-impresora'].disabled, true);
  assert.equal(env.elementos['enlace-volver-impresora'].href, 'cajero.html');
  assert.match(env.elementos['error-pdf-impresora'].textContent, /identificador de pago/i);
});

test('22: 403 o error del PDF no generan una vista falsa ni habilitan impresion', async () => {
  const env = entorno({ responder: async () => ({
    ok: false, status: 403, headers: {get:()=> 'application/json'},
    json: async () => ({message:'Solo puedes imprimir tus propios pagos.'}),
  }) });
  env.callbacks.get('DOMContentLoaded')(); await completar();
  assert.equal(env.creados.length, 0);
  assert.equal(env.elementos['btn-imprimir-impresora'].disabled, true);
  assert.match(env.elementos['error-pdf-impresora'].textContent, /propios pagos/i);
  assert.equal(env.elementos['btn-reintentar-pdf-impresora'].classList.contains('hidden'), false);
});

test('22: 401 redirige al login del cajero y descarta la sesion local', async () => {
  const env = entorno({ responder: async () => ({ ok:false, status:401, json:async()=>({message:'Sesion vencida'}) }) });
  env.callbacks.get('DOMContentLoaded')(); await completar();
  assert.equal(env.window.claveBorrada, 'menugo_cajero_sesion');
  assert.equal(env.window.location.redirigido, 'login.html?access=required');
  assert.equal(env.creados.length, 0);
});

test('22: no permite previsualizar una respuesta HTML confundida con PDF', async () => {
  const env = entorno({ responder: async () => ({
    ok: true, status: 200, headers: {get:()=> 'text/html'},
    blob: async () => new Blob(['<h1>error</h1>'], {type:'text/html'}),
  }) });
  env.callbacks.get('DOMContentLoaded')(); await completar();
  assert.equal(env.creados.length, 0);
  assert.match(env.elementos['error-pdf-impresora'].textContent, /PDF valido/i);
});

test('22: ofrece opcion de ticket a pago confirmado sin insertar los campos del cliente como HTML', () => {
  const env = entorno();
  assert.equal(env.window.MenuGoTicket.ofrecerImpresion({id_pago:39, monto:'35.00', pagado_por:'<img src=x onerror=alert(1)>'},{retorno:'cajero.html'}),true);
  assert.equal(env.agregados.length,1);
  const modal = env.agregados[0];
  assert.equal(modal.querySelector('#detalle-confirmacion-ticket').textContent,'Pago #39 · S/ 35.00. Tu operación está guardada en MenuGo.');
  assert.equal(modal.querySelector('#ir-impresora-ticket').href,'impresora_virtual.html?pago=39&volver=cajero.html');
  assert.doesNotMatch(modal.innerHTML, /<img src=x/);
  modal.querySelector('#cerrar-modal-ticket').emit('click');
  assert.equal(modal.removed, true);
});

test('22: respuesta sin id_pago no abre un modal con ticket inventado', () => {
  const env = entorno();
  assert.equal(env.window.MenuGoTicket.ofrecerImpresion({monto:'50.00'}), false);
  assert.equal(env.agregados.length, 0);
});

test('22: modo reducido, reimpresion y pagehide liberan el PDF sin cambiar el servidor', async () => {
  const env = entorno(); env.callbacks.get('DOMContentLoaded')(); await completar();
  env.elementos['btn-simular-impresora'].emit('click');
  assert.equal(env.elementos['papel-impresora'].classList.contains('impreso'), true);
  env.listeners.get('pagehide')();
  assert.deepEqual(env.revocados, [env.creados[0]]);
  assert.equal(env.elementos['btn-imprimir-impresora'].disabled, true);
  assert.equal(env.llamadas.length, 1);
});


test('25: tras cobrar se ofrece impresion inmediata por GET sin segundo pago', async () => {
  const env = entorno();
  env.ventana.location = {href: ''};
  const avisos = [];
  const resultado = await env.window.MenuGoTicket.abrirPdfDespuesDeCobro(39, '80', msg => avisos.push(msg));
  assert.equal(resultado, true);
  assert.equal(env.llamadas.length, 1);
  assert.equal(env.llamadas[0].config.method, 'GET');
  assert.match(env.llamadas[0].url, /\/pagos\/39\/ticket\.pdf\?ancho=80/);
  assert.deepEqual(env.ventanas[0], {url:'about:blank',dest:'_blank'});
  assert.match(env.ventana.location.href, /^blob:/);
  assert.match(avisos[0], /Ctrl\+P|Imprimir/);
});
