'use strict';

// Commit 06: formulario de efectivo, sin navegador ni base de datos reales.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ruta = path.resolve(__dirname, '../../Frontend/js/caja.js');
const fuente = fs.readFileSync(ruta, 'utf8');

function prepararEscenario({ recibo = '', metodo = 'Efectivo', montos = ['35.00'], bloquearRespuesta = false } = {}) {
  const llamadas = [];
  const alertas = [];
  let resolverRespuesta;
  const elementos = {
    'metodo-cobro-caja': { value: metodo },
    'campos-pago-caja': { innerHTML: '' },
    'monto-recibido-caja': {
      value: recibo,
      atributos: {},
      setAttribute(k, v) { this.atributos[k] = v; },
      focus() { this.enfocado = true; },
    },
    'etiqueta-vuelto-caja': { textContent: '' },
    'vuelto-caja': { textContent: '', className: '' },
    'estado-efectivo-caja': { textContent: '' },
    'resumen-efectivo-caja': { className: '' },
    'boton-registrar-caja': { disabled: true, textContent: '' },
    'total-cobro-caja': { textContent: '' },
    'referencia-pago-caja': { value: 'YAPE-2026' },
    'comprobante-caja': { value: 'boleta' },
    'documento-caja': { value: '12345678' },
    'razon-social-caja': { value: '' },
    'pagado-por-caja': { value: 'Cliente' },
    'mesa-pagadora-caja': { value: '' },
    'panel-cobro': { classList: { add() {} } },
    'contenido-cobro': { innerHTML: '' },
    'notificaciones-caja': { textContent: '', classList: { add() {}, remove() {} } },
  };
  const billetes = [20, 50, 100, 200].map((valor) => ({
    dataset: { billeteCaja: String(valor) }, disabled: false, title: '',
  }));
  const contexto = vm.createContext({
    window: { MENUGO_PERSONAL_BLOQUEADO: false, MENUGO_API: 'http://localhost:4000/api', location: { search: '' }, crypto: require('node:crypto').webcrypto },
    URLSearchParams,
    document: {
      getElementById: (id) => elementos[id] || null,
      querySelectorAll: (selector) => {
        if (selector === '[data-billete-caja]') return billetes;
        if (selector === '.item-cobro-caja:checked') return montos.map((monto, i) => ({ dataset: { id: String(11 + i), monto: String(monto) } }));
        return [];
      },
      addEventListener() {},
    },
    headersAutenticadosPersonal: () => ({ Authorization: 'Bearer test' }),
    fetch: async (url, options) => {
      llamadas.push({ url, options });
      if (bloquearRespuesta) await new Promise((resolve) => { resolverRespuesta = resolve; });
      return { status: 201, ok: true, json: async () => ({ ok: true, data: { monto: '35.00', monto_recibido: '50.00', vuelto: '15.00' } }) };
    },
    setInterval() {},
    setTimeout() {},
    alert: (texto) => alertas.push(String(texto)),
    console,
  });
  vm.runInContext(fuente, contexto, { filename: ruta });
  vm.runInContext('recargarCaja = async () => {}', contexto);
  return { contexto, elementos, billetes, llamadas, alertas, resolverRespuesta: () => resolverRespuesta?.() };
}

test('HTML de efectivo ofrece acceso rapido y no presupone dinero recibido', () => {
  const { contexto, elementos } = prepararEscenario();
  contexto.actualizarCamposPagoCaja();
  const html = elementos['campos-pago-caja'].innerHTML;
  assert.match(html, /input id="monto-recibido-caja"/);
  assert.match(html, /inputmode="decimal"/);
  assert.match(html, /seleccionarMontoEfectivoCaja\('exacto'\)/);
  for (const billete of [20, 50, 100, 200]) assert.match(html, new RegExp(`data-billete-caja="${billete}"`));
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /value="35\.00"/);
  assert.equal(elementos['boton-registrar-caja'].disabled, true);
});

test('S/35 cobrados con S/50 devuelven S/15 y habilitan registrar', () => {
  const { contexto, elementos } = prepararEscenario({ recibo: '50.00' });
  contexto.actualizarVueltoCaja();
  assert.equal(elementos['vuelto-caja'].textContent, 'S/ 15.00');
  assert.equal(elementos['boton-registrar-caja'].disabled, false);
  assert.match(elementos['resumen-efectivo-caja'].className, /emerald/);
  assert.equal(elementos['monto-recibido-caja'].atributos['aria-invalid'], 'false');
});

test('pago exacto muestra vuelto cero y permite cobro', () => {
  const { contexto, elementos } = prepararEscenario({ recibo: '35.00' });
  contexto.actualizarVueltoCaja();
  assert.equal(elementos['vuelto-caja'].textContent, 'S/ 0.00');
  assert.match(elementos['estado-efectivo-caja'].textContent, /pago exacto/i);
  assert.equal(elementos['boton-registrar-caja'].disabled, false);
});

test('efectivo insuficiente muestra dinero faltante y bloquea el boton', () => {
  const { contexto, elementos } = prepararEscenario({ recibo: '20.00' });
  contexto.actualizarVueltoCaja();
  assert.equal(elementos['etiqueta-vuelto-caja'].textContent, 'Dinero faltante');
  assert.equal(elementos['vuelto-caja'].textContent, 'S/ 15.00');
  assert.match(elementos['estado-efectivo-caja'].textContent, /falta efectivo/i);
  assert.equal(elementos['boton-registrar-caja'].disabled, true);
  assert.equal(elementos['monto-recibido-caja'].atributos['aria-invalid'], 'true');
});

test('monto vacio o invalido impide confirmar pago', () => {
  const { contexto, elementos } = prepararEscenario();
  for (const monto of ['', '-5', '1e2', '35.001', 'NaN', '9999999999999']) {
    elementos['monto-recibido-caja'].value = monto;
    contexto.actualizarVueltoCaja();
    assert.equal(elementos['boton-registrar-caja'].disabled, true, `Se debe rechazar ${monto}`);
  }
});

test('atajo exacto y billete S/50 actualizan el input y el vuelto', () => {
  const { contexto, elementos } = prepararEscenario();
  contexto.seleccionarMontoEfectivoCaja('exacto');
  assert.equal(elementos['monto-recibido-caja'].value, '35.00');
  assert.equal(elementos['vuelto-caja'].textContent, 'S/ 0.00');
  contexto.seleccionarMontoEfectivoCaja(50);
  assert.equal(elementos['monto-recibido-caja'].value, '50.00');
  assert.equal(elementos['vuelto-caja'].textContent, 'S/ 15.00');
  assert.equal(elementos['monto-recibido-caja'].enfocado, true);
});

test('deshabilita atajos que no cubren el monto seleccionado', () => {
  const { contexto, billetes } = prepararEscenario({ recibo: '50.00' });
  contexto.actualizarVueltoCaja();
  assert.equal(billetes[0].disabled, true);
  assert.equal(billetes[1].disabled, false);
  assert.equal(billetes[2].disabled, false);
  assert.equal(billetes[3].disabled, false);
});

test('al cambiar productos recalcula el faltante sin alterar lo escrito', () => {
  const montos = ['20.00'];
  const { contexto, elementos } = prepararEscenario({ recibo: '25.00', montos });
  contexto.actualizarTotalCobroCaja();
  assert.equal(elementos['boton-registrar-caja'].disabled, false);
  montos.push('15.00');
  contexto.actualizarTotalCobroCaja();
  assert.equal(elementos['total-cobro-caja'].textContent, 'S/ 35.00');
  assert.equal(elementos['monto-recibido-caja'].value, '25.00');
  assert.equal(elementos['vuelto-caja'].textContent, 'S/ 10.00');
  assert.equal(elementos['boton-registrar-caja'].disabled, true);
});

test('suma exacta de centimos 0.10 + 0.20', () => {
  const { contexto, elementos } = prepararEscenario({ montos: ['0.10', '0.20'], recibo: '0.30' });
  contexto.actualizarVueltoCaja();
  assert.equal(elementos['boton-registrar-caja'].disabled, false);
  assert.equal(elementos['vuelto-caja'].textContent, 'S/ 0.00');
  assert.equal(contexto.totalSeleccionadoCaja(), 0.3);
});

test('los pagos digitales mantienen el campo de referencia y su confirmacion', async () => {
  const { contexto, elementos, llamadas } = prepararEscenario({ metodo: 'Yape' });
  contexto.actualizarCamposPagoCaja();
  assert.match(elementos['campos-pago-caja'].innerHTML, /referencia-pago-caja/);
  assert.equal(elementos['boton-registrar-caja'].disabled, false);
  await contexto.registrarPagoCaja({ preventDefault() {} }, '7');
  assert.equal(llamadas.length, 1);
  assert.equal(Object.hasOwn(JSON.parse(llamadas[0].options.body), 'monto_recibido'), false);
});

test('doble envio concurrente ejecuta una sola solicitud y restaura el boton', async () => {
  const prueba = prepararEscenario({ recibo: '50.00', bloquearRespuesta: true });
  const { contexto, elementos, llamadas, resolverRespuesta } = prueba;
  const primero = contexto.registrarPagoCaja({ preventDefault() {} }, '7');
  const segundo = contexto.registrarPagoCaja({ preventDefault() {} }, '7');
  await segundo;
  assert.equal(llamadas.length, 1);
  assert.equal(elementos['boton-registrar-caja'].disabled, true);
  assert.equal(elementos['boton-registrar-caja'].textContent, 'Registrando pago...');
  resolverRespuesta();
  await primero;
  assert.equal(llamadas.length, 1);
  assert.equal(elementos['boton-registrar-caja'].disabled, false);
  assert.equal(elementos['boton-registrar-caja'].textContent, 'Registrar cobro');
});

test('sin productos seleccionados no se puede registrar el cobro', async () => {
  const { contexto, elementos, llamadas } = prepararEscenario({ recibo: '200.00', montos: [] });
  contexto.actualizarTotalCobroCaja();
  assert.equal(elementos['boton-registrar-caja'].disabled, true);
  await contexto.registrarPagoCaja({ preventDefault() {} }, '7');
  assert.equal(llamadas.length, 0);
});

test('no envia solicitudes de efectivo con importes incorrectos', async () => {
  const { contexto, elementos, llamadas, alertas } = prepararEscenario({ recibo: '35.001' });
  await contexto.registrarPagoCaja({ preventDefault() {} }, '7');
  assert.equal(llamadas.length, 0);
  assert.equal(elementos['boton-registrar-caja'].disabled, true);
  assert.match(alertas[0], /monto recibido valido/i);
});

test('si el servidor rechaza el pago vuelve a habilitar el boton para corregirlo', async () => {
  const { contexto, elementos, alertas } = prepararEscenario({ recibo: '50.00' });
  contexto.fetch = async () => ({
    status: 409,
    ok: false,
    json: async () => ({ ok: false, message: 'El pedido ya se pago' }),
  });
  await contexto.registrarPagoCaja({ preventDefault() {} }, '7');
  assert.equal(elementos['boton-registrar-caja'].disabled, false);
  assert.equal(elementos['boton-registrar-caja'].textContent, 'Registrar cobro');
  assert.match(alertas[0], /ya se pago/i);
});
