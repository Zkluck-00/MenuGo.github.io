'use strict';

// Pruebas del formulario del cajero sin navegador ni PostgreSQL.
// Confirman que el monto escrito por el cajero se envia a la API.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ruta = path.resolve(__dirname, '../../Frontend/js/caja.js');
const fuente = fs.readFileSync(ruta, 'utf8');

function escenarioCaja({ metodo = 'Efectivo', recibido = '50.00', referencia = 'OP-1234', respuestaOk = true, montos = ['24.50'] } = {}) {
  const llamadas = [];
  const alertas = [];
  const notificacion = {
    textContent: '',
    classList: { add() {}, remove() {} },
  };
  const elementos = {
    'metodo-cobro-caja': { value: metodo },
    'monto-recibido-caja': { value: recibido },
    'referencia-pago-caja': { value: referencia },
    'comprobante-caja': { value: 'boleta' },
    'documento-caja': { value: '12345678' },
    'razon-social-caja': { value: '' },
    'pagado-por-caja': { value: 'Cliente' },
    'mesa-pagadora-caja': { value: '' },
    'panel-cobro': { classList: { add() {} } },
    'contenido-cobro': { innerHTML: '' },
    'notificaciones-caja': notificacion,
  };
  const contexto = vm.createContext({
    window: { MENUGO_PERSONAL_BLOQUEADO: false, MENUGO_API: 'http://localhost:4000/api', location: { search: '' }, crypto: require('node:crypto').webcrypto },
    URLSearchParams,
    document: {
      getElementById: (id) => elementos[id] || null,
      querySelectorAll: (selector) => selector === '.item-cobro-caja:checked'
        ? montos.map((monto, i) => ({ dataset: { id: String(11 + i), monto } })) : [],
      addEventListener() {},
    },
    headersAutenticadosPersonal: () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer test' }),
    fetch: async (url, options) => {
      llamadas.push({ url, options });
      return {
        ok: respuestaOk,
        status: respuestaOk ? 201 : 400,
        json: async () => respuestaOk
          ? { ok: true, data: { monto: '24.50', monto_recibido: '50.00', vuelto: '25.50' } }
          : { ok: false, message: 'No se pudo registrar el pago.' },
      };
    },
    alert: (mensaje) => alertas.push(String(mensaje)),
    setTimeout: () => 0,
    setInterval: () => 0,
    console,
  });
  vm.runInContext(fuente, contexto, { filename: ruta });
  // No necesitamos recargar las listas para comprobar el payload HTTP.
  vm.runInContext('recargarCaja = async () => {}', contexto);
  return { contexto, llamadas, alertas, notificacion };
}

async function enviar(escenario) {
  await escenario.contexto.registrarPagoCaja({ preventDefault() {} }, '7');
  return escenario;
}

test('efectivo envia la cifra original que escribio el cajero', async () => {
  const { llamadas, notificacion, alertas } = await enviar(escenarioCaja());
  assert.equal(llamadas.length, 1);
  assert.match(llamadas[0].url, /\/cajero\/cuentas\/7\/pagos$/);
  const cuerpo = JSON.parse(llamadas[0].options.body);
  assert.equal(cuerpo.monto_recibido, '50.00');
  assert.equal(cuerpo.metodo_pago, 'Efectivo');
  assert.equal(cuerpo.detalles[0].id_detalle_producto, 11);
  assert.match(notificacion.textContent, /vuelto confirmado: S\/ 25\.50/i);
  assert.deepEqual(alertas, []);
});

test('Yape y tarjeta no envian monto_recibido', async () => {
  for (const metodo of ['Yape', 'Tarjeta credito']) {
    const { llamadas, alertas } = await enviar(escenarioCaja({ metodo }));
    assert.equal(llamadas.length, 1);
    const cuerpo = JSON.parse(llamadas[0].options.body);
    assert.equal(Object.hasOwn(cuerpo, 'monto_recibido'), false);
    assert.equal(cuerpo.referencia, 'OP-1234');
    assert.deepEqual(alertas, []);
  }
});

test('no envia un cobro si falta efectivo', async () => {
  const { llamadas, alertas } = await enviar(escenarioCaja({ recibido: '' }));
  assert.equal(llamadas.length, 0);
  assert.match(alertas[0], /debe cubrir/i);
});

test('un error del servidor no muestra cobro realizado', async () => {
  const { llamadas, alertas, notificacion } = await enviar(escenarioCaja({ respuestaOk: false }));
  assert.equal(llamadas.length, 1);
  assert.match(alertas[0], /no se pudo registrar/i);
  assert.equal(notificacion.textContent, '');
});

test('UI admite efectivo exacto para dos articulos con centimos', async () => {
  const { llamadas, alertas } = await enviar(escenarioCaja({ montos: ['0.10', '0.20'], recibido: '0.30' }));
  assert.equal(llamadas.length, 1);
  assert.equal(JSON.parse(llamadas[0].options.body).monto_recibido, '0.30');
  assert.deepEqual(alertas, []);
});
