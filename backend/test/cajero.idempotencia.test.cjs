'use strict';

// Commit 08: reintentos, concurrencia, conflictos y recuperacion tras una
// respuesta perdida. No requiere PostgreSQL ni modifica datos reales.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rutaControlador = path.join(__dirname, '../src/controllers/cajero.controller.js');
const rutaFrontend = path.resolve(__dirname, '../../Frontend/js/caja.js');
const fuenteControlador = fs.readFileSync(rutaControlador, 'utf8');
const fuenteFrontend = fs.readFileSync(rutaFrontend, 'utf8');
const CLAVE = 'menugo-prueba-idempotencia-2026-001';

function prepararBackend({ errorCommitLuegoDeGuardar = false } = {}) {
  const pagos = [];
  const registros = [];
  const eventos = [];
  const locks = new Map();
  let generadorId = 200;
  let fallarCommit = errorCommitLuegoDeGuardar;

  // Simula bloqueo transaccional del lado de PostgreSQL; una clave debe
  // terminar su transaccion antes de que otra solicitud igual avance.
  async function bloquear(clave) {
    const anterior = locks.get(clave) || Promise.resolve();
    let liberar;
    const futuro = new Promise((resolve) => { liberar = resolve; });
    locks.set(clave, anterior.then(() => futuro));
    await anterior;
    return liberar;
  }

  function clienteNuevo() {
    let liberar = null;
    let pagoPendiente = null;
    let comprobantePendiente = null;
    async function finalizar(confirmar) {
      if (confirmar && pagoPendiente) {
        pagos.push({ ...pagoPendiente, ...comprobantePendiente });
      }
      pagoPendiente = null;
      comprobantePendiente = null;
      liberar?.();
      liberar = null;
    }
    return {
      async query(sql, parametros = []) {
        const texto = String(sql).trim();
        if (texto === 'BEGIN') return { rows: [] };
        if (texto === 'ROLLBACK') {
          await finalizar(false);
          return { rows: [] };
        }
        if (texto === 'COMMIT') {
          await finalizar(true);
          if (fallarCommit) {
            fallarCommit = false;
            throw new Error('Se perdio la conexion al terminar COMMIT');
          }
          return { rows: [] };
        }
        if (/pg_advisory_xact_lock/.test(texto)) {
          liberar = await bloquear(parametros[0]);
          return { rows: [{ pg_advisory_xact_lock: '' }] };
        }
        if (/WHERE pg.idempotency_key = \$1/.test(texto)) {
          const previo = pagos.find((p) => p.idempotency_key === parametros[0]);
          return { rows: previo ? [previo] : [] };
        }
        if (/SELECT id_turno FROM public\.turnos_caja/.test(texto)) {
          return { rows: [{ id_turno: 777 }] };
        }
        if (/SELECT id_cuenta, id_grupo_mesa, estado, total FROM cuentas/.test(texto)) {
          return { rows: [{ id_cuenta: 7, id_grupo_mesa: 2, estado: 'pendiente', total: '24.50' }] };
        }
        if (/SELECT dp.id_detalle_producto/.test(texto) && /p.tipo_pedido/.test(texto) && /AS pendiente/.test(texto)) {
          return { rows: pagos.length === 0 ? [
            { id_detalle_producto: 11, id_pedido: 6, subtotal: '24.50', tipo_pedido: 'mesa', estado_pedido: 'entregado', pendiente: '24.50' }
          ] : [] };
        }
        if (/INSERT INTO pagos/.test(texto)) {
          registros.push({ sql: texto, parametros });
          pagoPendiente = {
            id_pago: ++generadorId,
            id_cuenta: parametros[0],
            id_grupo_mesa: 2,
            metodo_pago: parametros[1],
            monto: parametros[2],
            pagado_por: parametros[3],
            estado_pago: 'pagado',
            referencia: parametros[4],
            id_cajero: parametros[8],
            monto_recibido: parametros[9],
            vuelto: parametros[10],
            idempotency_key: parametros[11],
            idempotency_hash: parametros[12],
          };
          return { rows: [pagoPendiente] };
        }
        if (/INSERT INTO comprobantes/.test(texto)) {
          comprobantePendiente = {
            comprobante_tipo: parametros[1],
            comprobante_dni: parametros[2],
            comprobante_ruc: parametros[3],
            comprobante_razon_social: parametros[4],
          };
          return { rows: [] };
        }
        if (/SELECT COALESCE\(SUM\(pendiente\), 0\) AS saldo/.test(texto)) {
          return { rows: [{ saldo: '0.00' }] };
        }
        if (/hay_pedidos_pendientes/.test(texto)) {
          return { rows: [{ hay_pedidos_pendientes: false, hay_cuentas_pendientes: false }] };
        }
        return { rows: [] };
      },
      release() {},
    };
  }
  const dependencias = {
    '../config/db': {
      cajeroPool: {
        connect: async () => clienteNuevo(),
        query: (...args) => clienteNuevo().query(...args),
      },
    },
    './pedidos.controller': { mapMetodoPago() { return 'efectivo'; } },
    '../utils/eventEmitter': {
      emitPagoRegistrado(datos) { eventos.push({ tipo: 'pago', id: datos.id_pago }); },
      emitCuentaActualizada(datos) { eventos.push({ tipo: 'cuenta', id: datos.id_cuenta }); },
    },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(fuenteControlador, {
    module: modulo, exports: modulo.exports,
    require(nombre) {
      if (nombre === 'node:crypto') return require('node:crypto');
      if (!Object.hasOwn(dependencias, nombre)) throw new Error(`Dependencia inesperada ${nombre}`);
      return dependencias[nombre];
    },
    console: { error() {} },
  }, { filename: rutaControlador });

  async function solicitar(body = {}, { idCuenta = 7, idCajero = 9 } = {}) {
    const respuesta = {
      statusCode: 200, payload: null,
      status(codigo) { this.statusCode = codigo; return this; },
      json(datos) { this.payload = datos; return this; },
    };
    const datos = {
      metodo_pago: 'Efectivo', monto_recibido: '50.00',
      detalles: [{ id_detalle_producto: 11, monto: '0.01' }],
      tipo_comprobante: 'boleta', dni: '12345678',
      idempotency_key: CLAVE,
      ...body,
    };
    await modulo.exports.registrarPago({
      params: { id: String(idCuenta) }, body: datos,
      personal: { id_trabajador: idCajero, nombre: 'Cajero prueba' },
    }, respuesta);
    return respuesta;
  }
  return { solicitar, pagos, registros, eventos };
}

test('primer intento: pago 201, clave y hash SHA-256 guardados', async () => {
  const sistema = prepararBackend();
  const respuesta = await sistema.solicitar();
  assert.equal(respuesta.statusCode, 201);
  assert.equal(respuesta.payload.repetido, false);
  assert.equal(sistema.pagos.length, 1);
  assert.equal(sistema.pagos[0].idempotency_key, CLAVE);
  assert.match(sistema.pagos[0].idempotency_hash, /^[0-9a-f]{64}$/);
  assert.equal(sistema.registros[0].parametros[2], '24.50');
  assert.equal(sistema.eventos.length, 2);
});

test('reintento identico: devuelve el mismo pago 200 sin INSERT ni evento', async () => {
  const sistema = prepararBackend();
  const primero = await sistema.solicitar();
  const segundo = await sistema.solicitar();
  assert.equal(primero.statusCode, 201);
  assert.equal(segundo.statusCode, 200);
  assert.equal(segundo.payload.repetido, true);
  assert.equal(segundo.payload.data.id_pago, primero.payload.data.id_pago);
  assert.equal(sistema.registros.length, 1);
  assert.equal(sistema.eventos.length, 2);
});

test('misma clave con efectivo cambiado responde 409 y no cobra de nuevo', async () => {
  const sistema = prepararBackend();
  await sistema.solicitar();
  const duplicado = await sistema.solicitar({ monto_recibido: '100.00' });
  assert.equal(duplicado.statusCode, 409);
  assert.equal(duplicado.payload.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(sistema.registros.length, 1);
});

test('misma clave desde otra cuenta u otro cajero no recupera pago ajeno', async () => {
  const sistema = prepararBackend();
  await sistema.solicitar();
  const cuentaAjena = await sistema.solicitar({}, { idCuenta: 8 });
  const cajeroAjeno = await sistema.solicitar({}, { idCajero: 22 });
  assert.equal(cuentaAjena.statusCode, 409);
  assert.equal(cajeroAjeno.statusCode, 409);
  assert.equal(sistema.registros.length, 1);
});

test('dos solicitudes concurrentes: el bloqueo por clave produce solo un INSERT', async () => {
  const sistema = prepararBackend();
  const respuestas = await Promise.all([sistema.solicitar(), sistema.solicitar()]);
  assert.deepEqual(respuestas.map((r) => r.statusCode).sort(), [200, 201]);
  assert.equal(sistema.pagos.length, 1);
  assert.equal(sistema.registros.length, 1);
});

test('respuesta perdida tras COMMIT: recupera el pago sin repetirlo', async () => {
  const sistema = prepararBackend({ errorCommitLuegoDeGuardar: true });
  const primero = await sistema.solicitar();
  assert.equal(primero.statusCode, 500);
  assert.equal(primero.payload.code, 'PAGO_NO_CONFIRMADO');
  assert.equal(sistema.pagos.length, 1);
  const segundo = await sistema.solicitar();
  assert.equal(segundo.statusCode, 200);
  assert.equal(segundo.payload.repetido, true);
  assert.equal(sistema.registros.length, 1);
});

test('rechaza clave ausente o malformada antes de la insercion', async () => {
  for (const clave of [undefined, null, '', 'corta', 'key con salto\n', 'con espacios al final    ']) {
    const sistema = prepararBackend();
    const respuesta = await sistema.solicitar({ idempotency_key: clave });
    assert.equal(respuesta.statusCode, 400);
    assert.equal(sistema.registros.length, 0);
  }
});

function prepararFrontend({ estados = ['fallo-red', 'repetido'] } = {}) {
  const llamadas = [];
  const alertas = [];
  let generadas = 0;
  let intentos = 0;
  const elementos = {
    'metodo-cobro-caja': { value: 'Efectivo' },
    'monto-recibido-caja': { value: '50.00' },
    'comprobante-caja': { value: 'boleta' },
    'documento-caja': { value: '12345678' },
    'pagado-por-caja': { value: 'Cliente' },
    'mesa-pagadora-caja': { value: '' },
    'boton-registrar-caja': { textContent: 'Registrar cobro', disabled: false },
    'panel-cobro': { classList: { add() {} } },
    'contenido-cobro': { innerHTML: '' },
    'notificaciones-caja': { textContent: '', classList: { add() {}, remove() {} } },
  };
  const contexto = vm.createContext({
    window: {
      MENUGO_PERSONAL_BLOQUEADO: false,
      MENUGO_API: 'http://localhost:4000/api',
      location: { search: '' },
      crypto: { randomUUID() { generadas += 1; return `e8a1f2d3-0000-4000-a000-${String(generadas).padStart(12, '0')}`; } },
    },
    URLSearchParams,
    document: {
      getElementById(id) { return elementos[id] || null; },
      querySelectorAll(selector) {
        return selector === '.item-cobro-caja:checked' ? [{ dataset: { id: '11', monto: '24.50' } }] : [];
      },
      addEventListener() {},
    },
    headersAutenticadosPersonal: () => ({ 'Content-Type': 'application/json' }),
    fetch: async (url, options) => {
      llamadas.push({ url, options });
      const estado = estados[intentos++] || 'repetido';
      if (estado === 'fallo-red') throw new Error('Failed to fetch');
      if (estado === 'error-400') {
        return { ok: false, status: 400, json: async () => ({ ok: false, message: 'Datos invalidos' }) };
      }
      return {
        ok: true, status: estado === 'repetido' ? 200 : 201,
        json: async () => ({
          ok: true, repetido: estado === 'repetido',
          data: { id_pago: 201, vuelto: '25.50' },
        }),
      };
    },
    alert: (s) => alertas.push(String(s)),
    setTimeout() {}, setInterval() {}, console,
  });
  vm.runInContext(fuenteFrontend, contexto, { filename: rutaFrontend });
  vm.runInContext('recargarCaja = async () => {}', contexto);
  return { contexto, alertas, elementos, llamadas, generadas: () => generadas };
}

test('frontend: reintento tras error de red conserva la misma clave y el mismo cuerpo', async () => {
  const ui = prepararFrontend();
  await ui.contexto.registrarPagoCaja({ preventDefault() {} }, '7');
  assert.match(ui.alertas[0], /reintenta sin cambiar/i);
  await ui.contexto.registrarPagoCaja({ preventDefault() {} }, '7');
  assert.equal(ui.llamadas.length, 2);
  assert.equal(ui.llamadas[0].options.body, ui.llamadas[1].options.body);
  assert.equal(ui.generadas(), 1);
  const cuerpo = JSON.parse(ui.llamadas[0].options.body);
  assert.ok(cuerpo.idempotency_key.length >= 16);
  assert.match(ui.elementos['notificaciones-caja'].textContent, /no se duplico/i);
});

test('frontend: ante red incierta no deja cambiar los datos y generar otra clave', async () => {
  const ui = prepararFrontend();
  await ui.contexto.registrarPagoCaja({ preventDefault() {} }, '7');
  ui.elementos['monto-recibido-caja'].value = '100.00';
  await ui.contexto.registrarPagoCaja({ preventDefault() {} }, '7');
  assert.equal(ui.llamadas.length, 1);
  assert.equal(ui.generadas(), 1);
  assert.match(ui.alertas[1], /cobro cuyo resultado no se pudo confirmar/i);
});

test('frontend: HTTP 400 permite corregir datos y genera una nueva clave', async () => {
  const ui = prepararFrontend({ estados: ['error-400', 'nuevo'] });
  await ui.contexto.registrarPagoCaja({ preventDefault() {} }, '7');
  ui.elementos['monto-recibido-caja'].value = '100.00';
  await ui.contexto.registrarPagoCaja({ preventDefault() {} }, '7');
  assert.equal(ui.llamadas.length, 2);
  assert.notEqual(JSON.parse(ui.llamadas[0].options.body).idempotency_key, JSON.parse(ui.llamadas[1].options.body).idempotency_key);
  assert.equal(ui.generadas(), 2);
});
