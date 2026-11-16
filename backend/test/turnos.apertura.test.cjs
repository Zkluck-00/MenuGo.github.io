'use strict';

// Commit 13 - Pruebas de apertura de turnos sin Neon.
// Ejecutar: node --test backend/test/turnos.apertura.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const codigo = fs.readFileSync(path.resolve(__dirname, '../src/controllers/turnos-caja.controller.js'), 'utf8');
const rutaPago = path.resolve(__dirname, '../src/controllers/cajero.controller.js');
const codigoPago = fs.readFileSync(rutaPago, 'utf8');
const frontend = fs.readFileSync(path.resolve(__dirname, '../../Frontend/js/turnos-caja.js'), 'utf8');
const pantalla = fs.readFileSync(path.resolve(__dirname, '../../Frontend/Cajero/cajero.html'), 'utf8');
const rutas = fs.readFileSync(path.resolve(__dirname, '../src/routes/cajero.routes.js'), 'utf8');

function prepararDB({ existe = false, error = null } = {}) {
  const consultas = [];
  let turno = existe ? {
    id_turno: '50', id_cajero: 8, estado: 'abierto',
    fondo_inicial: '40.00', abierto_at: '2026-10-20T12:00:00Z',
    observaciones: 'Anterior', cantidad_pagos: 2, total_cobrado: '35.00', ventas_efectivo: '15.00',
  } : null;
  const pool = {
    async query(sql, params = []) {
      const sentencia = String(sql);
      consultas.push({ sentencia, params });
      if (error) throw error;
      if (/INSERT INTO public\.turnos_caja/.test(sentencia)) {
        if (turno) return { rows: [] };
        turno = {
          id_turno: '51', id_cajero: params[0], estado: 'abierto',
          fondo_inicial: params[1], observaciones: params[2],
          abierto_at: '2026-10-20T15:00:00Z',
        };
        return { rows: [{ ...turno }] };
      }
      if (/FROM public\.turnos_caja/.test(sentencia)) {
        return { rows: turno && params[0] === turno.id_cajero
          ? [{ ...turno, cantidad_pagos: turno.cantidad_pagos || 0, total_cobrado: turno.total_cobrado || '0.00', ventas_efectivo: turno.ventas_efectivo || '0.00' }] : [] };
      }
      return { rows: [] };
    },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(codigo, {
    module: modulo,
    exports: modulo.exports,
    console: { error() {} },
    require(nombre) {
      assert.equal(nombre, '../config/db');
      return { cajeroPool: pool };
    },
  }, { filename: 'turnos-caja.controller.js' });
  return { api: modulo.exports, consultas, obtenerTurno: () => turno };
}

function respuesta() {
  return {
    codigo: 200, datos: undefined,
    status(numero) { this.codigo = numero; return this; },
    json(datos) { this.datos = datos; return this; },
  };
}

function peticion(body = {}, personal = { id_trabajador: 8, rol: 'cajero' }) {
  return { body, personal };
}

async function abrir(sistema, body, personal) {
  const res = respuesta();
  await sistema.api.abrirTurnoCaja(peticion(body, personal), res);
  return res;
}

async function obtener(sistema, personal) {
  const res = respuesta();
  await sistema.api.obtenerTurnoActual(peticion({}, personal), res);
  return res;
}

test('apertura guarda fondo inicial, cajero autenticado y estado abierto', async () => {
  const s = prepararDB();
  const res = await abrir(s, { fondo_inicial: '100.50', observaciones: 'Fondo contado', id_cajero: 999 });
  assert.equal(res.codigo, 201);
  assert.equal(res.datos.ok, true);
  const insert = s.consultas[0];
  assert.match(insert.sentencia, /ON CONFLICT \(id_cajero\) WHERE estado = 'abierto'/);
  assert.deepEqual(Array.from(insert.params), [8, '100.50', 'Fondo contado']);
  assert.equal(res.datos.data.id_cajero, 8);
  assert.equal(res.datos.data.cantidad_pagos, 0);
});

test('permite fondo inicial cero y registra observaciones opcionales en NULL', async () => {
  const s = prepararDB();
  const res = await abrir(s, { fondo_inicial: 0 });
  assert.equal(res.codigo, 201);
  assert.equal(s.consultas[0].params[1], '0.00');
  assert.equal(s.consultas[0].params[2], null);
});

test('un segundo intento no modifica el turno activo', async () => {
  const s = prepararDB();
  await abrir(s, { fondo_inicial: '40.00' });
  const duplicado = await abrir(s, { fondo_inicial: '999.99' });
  assert.equal(duplicado.codigo, 409);
  assert.equal(duplicado.datos.code, 'TURNO_YA_ABIERTO');
  assert.equal(s.obtenerTurno().fondo_inicial, '40.00');
});

test('dos aperturas simultaneas crean un solo turno', async () => {
  const s = prepararDB();
  const [a, b] = await Promise.all([
    abrir(s, { fondo_inicial: '100.00' }), abrir(s, { fondo_inicial: '200.00' }),
  ]);
  assert.deepEqual([a.codigo, b.codigo].sort(), [201, 409]);
  assert.equal(s.obtenerTurno().id_turno, '51');
});

test('rechaza fondos negativos, exponenciales, decimales extra y no numericos', async () => {
  const valores = [-1, '1e3', '5.001', '1,50', '', undefined, null, NaN, Infinity, {}, true, '10000000000.00'];
  for (const valor of valores) {
    const s = prepararDB();
    const res = await abrir(s, { fondo_inicial: valor });
    assert.equal(res.codigo, 400, `Debio rechazarse ${String(valor)}`);
    assert.equal(s.consultas.length, 0);
  }
});

test('convierte centimos y recorta espacios sin alterar la precision', async () => {
  const s = prepararDB();
  const res = await abrir(s, { fondo_inicial: ' 0.10 ', observaciones: '   Fondo de caja   ' });
  assert.equal(res.codigo, 201);
  assert.equal(s.consultas[0].params[1], '0.10');
  assert.equal(s.consultas[0].params[2], 'Fondo de caja');
});

test('rechaza observaciones que superan 500 caracteres', async () => {
  const s = prepararDB();
  const res = await abrir(s, { fondo_inicial: '100', observaciones: 'X'.repeat(501) });
  assert.equal(res.codigo, 400);
  assert.equal(s.consultas.length, 0);
});

test('rechaza observaciones que no son texto', async () => {
  const s = prepararDB();
  const res = await abrir(s, { fondo_inicial: '10', observaciones: 400 });
  assert.equal(res.codigo, 400);
});

test('el administrador y el usuario sin sesion no pueden abrir turno', async () => {
  for (const personal of [null, { rol: 'administrador', id_administrador: 2 }, { rol: 'mesero', id_trabajador: 8 }, { rol: 'cajero', id_trabajador: 'invalido' }]) {
    const s = prepararDB();
    const res = await abrir(s, { fondo_inicial: '10.00' }, personal);
    assert.equal(res.codigo, 403);
    assert.equal(s.consultas.length, 0);
  }
});

test('consultar turno inexistente devuelve data null y hay_turno false', async () => {
  const s = prepararDB();
  const res = await obtener(s);
  assert.equal(res.codigo, 200);
  assert.equal(res.datos.hay_turno, false);
  assert.equal(res.datos.data, null);
});

test('consultar turno existente devuelve informacion y cobros solo propios', async () => {
  const s = prepararDB({ existe: true });
  const res = await obtener(s);
  assert.equal(res.codigo, 200);
  assert.equal(res.datos.hay_turno, true);
  assert.equal(res.datos.data.cantidad_pagos, 2);
  assert.equal(res.datos.data.ventas_efectivo, '15.00');
  assert.match(s.consultas[0].sentencia, /pg\.id_turno = t\.id_turno/);
  assert.deepEqual(Array.from(s.consultas[0].params), [8]);
});

test('cajero distinto no puede consultar un turno ajeno', async () => {
  const s = prepararDB({ existe: true });
  const res = await obtener(s, { id_trabajador: 9, rol: 'cajero' });
  assert.equal(res.datos.data, null);
  assert.deepEqual(Array.from(s.consultas[0].params), [9]);
});

test('informa migracion faltante sin filtrar detalles SQL al cliente', async () => {
  const s = prepararDB({ error: Object.assign(new Error('Internal table error'), { code: '42P01' }) });
  const res = await abrir(s, { fondo_inicial: '10.00' });
  assert.equal(res.codigo, 503);
  assert.equal(res.datos.code, 'MIGRACION_TURNOS_PENDIENTE');
  assert.doesNotMatch(JSON.stringify(res.datos), /Internal table error/);
});

test('rutas del turno exigen el rol cajero tras autenticar personal', () => {
  assert.match(rutas, /router\.use\(autenticarPersonal, autorizarRoles\('cajero', 'administrador'\)\)/);
  assert.match(rutas, /router\.get\('\/turnos\/actual', autorizarRoles\('cajero'\), turnosCajaController\.obtenerTurnoActual\)/);
  assert.match(rutas, /router\.post\('\/turnos', autorizarRoles\('cajero'\), turnosCajaController\.abrirTurnoCaja\)/);
});

test('pantalla del cajero incluye formulario y scripts de apertura', () => {
  for (const id of ['form-apertura-turno-caja', 'fondo-inicial-caja', 'estado-turno-caja', 'turno-id-caja', 'turno-total-caja', 'turno-efectivo-caja']) {
    assert.match(pantalla, new RegExp(`id="${id}"`));
  }
  assert.match(pantalla, /<script src="\.\.\/js\/turnos-caja\.js"><\/script>/);
});

test('frontend usa API autenticada, maneja duplicados y evita doble apertura', () => {
  assert.match(frontend, /apiCaja\('\/cajero\/turnos\/actual'\)/);
  assert.match(frontend, /apiCaja\('\/cajero\/turnos',/);
  assert.match(frontend, /if \(abriendoTurnoCaja\) return/);
  assert.match(frontend, /if \(error\.status === 409\) await cargarTurnoCaja\(\)/);
  assert.match(frontend, /window\.MENUGO_TURNO_CAJA_ABIERTO = abierto/);
});

test('backend vincula cada pago nuevo al turno e impide cobrar sin apertura', () => {
  assert.match(codigoPago, /SELECT id_turno FROM public\.turnos_caja/);
  assert.match(codigoPago, /FOR SHARE/);
  assert.match(codigoPago, /TURNO_CAJA_REQUERIDO/);
  assert.match(codigoPago, /idempotency_key, idempotency_hash, id_turno/);
  assert.match(codigoPago, /huella,\s*idTurno,/);
});

test('cierre antiguo no mezcla pagos asignados a los turnos nuevos', () => {
  assert.match(codigoPago, /AND pg\.id_turno IS NULL/);
});

function prepararPantalla({ turnoInicial = null, postError = null, postPendiente = false } = {}) {
  const elementos = new Map();
  const llamadas = [];
  let turno = turnoInicial;
  let resolverPost = null;
  function elem(id) {
    if (!elementos.has(id)) {
      const clases = new Set(['hidden']);
      elementos.set(id, {
        textContent: '', value: '', className: '', disabled: false,
        classList: {
          add(v) { clases.add(v); }, remove(v) { clases.delete(v); },
          toggle(v, force) {
            if (force === undefined) { if (clases.has(v)) clases.delete(v); else clases.add(v); }
            else if (force) clases.add(v); else clases.delete(v);
          },
          contains(v) { return clases.has(v); },
        },
      });
    }
    return elementos.get(id);
  }
  elem('fondo-inicial-caja').value = '50.00';
  elem('observaciones-apertura-caja').value = 'Fondo contado';
  const pantallaContexto = vm.createContext({
    window: {},
    document: { getElementById: elem, addEventListener() {} },
    apiCaja: async (url, options) => {
      llamadas.push({ url, options });
      if (url === '/cajero/turnos/actual') return { ok: true, data: turno };
      assert.equal(url, '/cajero/turnos');
      if (postPendiente) await new Promise((resolver) => { resolverPost = resolver; });
      if (postError) throw postError;
      turno = {
        id_turno: 51, estado: 'abierto', fondo_inicial: '50.00',
        abierto_at: '2026-10-20T15:00:00Z', cantidad_pagos: 0, total_cobrado: '0.00', ventas_efectivo: '0.00',
      };
      return { ok: true, data: turno };
    },
  });
  vm.runInContext(frontend, pantallaContexto);
  return { pantallaContexto, elem, llamadas, resolverPost: () => resolverPost?.() };
}

test('UI sin turno muestra el formulario y conserva bloqueados los cobros', async () => {
  const ui = prepararPantalla();
  await ui.pantallaContexto.cargarTurnoCaja();
  assert.equal(ui.pantallaContexto.window.MENUGO_TURNO_CAJA_ABIERTO, false);
  assert.equal(ui.elem('form-apertura-turno-caja').classList.contains('hidden'), false);
  assert.match(ui.elem('estado-turno-caja').textContent, /sin turno abierto/i);
});

test('UI abre turno enviando el fondo al endpoint autenticado y muestra resumen', async () => {
  const ui = prepararPantalla();
  await ui.pantallaContexto.cargarTurnoCaja();
  await ui.pantallaContexto.abrirTurnoCaja({ preventDefault() {} });
  const post = ui.llamadas.find((l) => l.options?.method === 'POST');
  assert.ok(post);
  assert.deepEqual(JSON.parse(post.options.body), { fondo_inicial: '50.00', observaciones: 'Fondo contado' });
  assert.equal(ui.pantallaContexto.window.MENUGO_TURNO_CAJA_ABIERTO, true);
  assert.equal(ui.elem('form-apertura-turno-caja').classList.contains('hidden'), true);
  assert.equal(ui.elem('resumen-turno-caja').classList.contains('hidden'), false);
  assert.equal(ui.elem('turno-fondo-caja').textContent, 'S/ 50.00');
});

test('UI 409 recupera el estado sin registrar una segunda apertura', async () => {
  const error = Object.assign(new Error('Ya tienes un turno abierto'), { status: 409 });
  const ui = prepararPantalla({ postError: error });
  await ui.pantallaContexto.cargarTurnoCaja();
  await ui.pantallaContexto.abrirTurnoCaja({ preventDefault() {} });
  assert.equal(ui.llamadas.filter((l) => l.options?.method === 'POST').length, 1);
  assert.equal(ui.elem('boton-abrir-turno-caja').disabled, false);
});

test('UI impide un segundo POST mientras la primera apertura no termina', async () => {
  const ui = prepararPantalla({ postPendiente: true });
  await ui.pantallaContexto.cargarTurnoCaja();
  const pendiente = ui.pantallaContexto.abrirTurnoCaja({ preventDefault() {} });
  await ui.pantallaContexto.abrirTurnoCaja({ preventDefault() {} });
  assert.equal(ui.llamadas.filter((l) => l.options?.method === 'POST').length, 1);
  assert.equal(ui.elem('boton-abrir-turno-caja').disabled, true);
  ui.resolverPost();
  await pendiente;
  assert.equal(ui.elem('boton-abrir-turno-caja').disabled, false);
});

test('UI de cobro rechaza abrir cuentas si no existe turno activo', () => {
  const codigoCaja = fs.readFileSync(path.resolve(__dirname, '../../Frontend/js/caja.js'), 'utf8');
  const mensajes = [];
  const contexto = vm.createContext({
    window: { MENUGO_PERSONAL_BLOQUEADO: false, MENUGO_TURNO_CAJA_ABIERTO: false, location: { search: '' } },
    URLSearchParams, document: { addEventListener() {} },
    alert(texto) { mensajes.push(texto); },
  });
  vm.runInContext(codigoCaja, contexto);
  contexto.abrirCobroCaja('7');
  assert.match(mensajes[0], /abrir tu turno/i);
});
