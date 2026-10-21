'use strict';

// Contratos de release que conectan la vista, las rutas, los controladores y el SQL.
// No usan Neon ni crean transacciones reales.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.resolve(__dirname, '../..');

function leer(ruta) { return fs.readFileSync(path.join(raiz, ruta), 'utf8'); }
function existe(ruta) { return fs.existsSync(path.join(raiz, ruta)); }
function sqlPrincipal(nombre) {
  // Algunos commits existentes en GitHub utilizan nombres sin fecha.
  const nombres = {
    turnos_caja: ['20261020_cajero_turnos_caja.sql', 'cajero_turnos.sql'],
    movimientos_caja: ['20261020_cajero_movimientos_caja.sql', 'cajero_movimientos_caja.sql'],
    subcuentas: ['20261020_cajero_subcuentas.sql', 'cajero_subcuentas.sql'],
    idempotencia_pagos: ['20261020_cajero_idempotencia_pagos.sql', 'cajero_idempotencia_pagos.sql'],
    cierre_idempotente: ['20261020_cajero_cierre_idempotente.sql', 'cajero_cierre_idempotente.sql'],
  };
  const archivo = (nombres[nombre] || []).find(nombreSql => existe(`database/${nombreSql}`));
  assert.ok(archivo, `No se encontro la migracion ${nombre} en database/`);
  return leer(`database/${archivo}`);
}

test('20: existen las pantallas principales del cajero', () => {
  for (const pagina of ['cajero.html', 'dividir_cuenta.html', 'movimientos_caja.html', 'corte_caja.html']) {
    assert.ok(existe(`Frontend/Cajero/${pagina}`), `Falta ${pagina}`);
  }
});

test('20: cada pantalla nueva carga su logica y autenticacion', () => {
  const pares = [
    ['dividir_cuenta.html', 'subcuentas-caja.js'],
    ['movimientos_caja.html', 'movimientos-caja.js'],
    ['corte_caja.html', 'arqueo-caja.js'],
  ];
  for (const [pagina, script] of pares) {
    const html = leer(`Frontend/Cajero/${pagina}`);
    assert.ok(html.includes('personal-auth.js'), `${pagina} no carga autenticacion`);
    assert.ok(html.includes(script), `${pagina} no carga ${script}`);
    assert.ok(existe(`Frontend/js/${script}`), `Falta ${script}`);
  }
});

test('20: la division es accesible desde el panel de caja', () => {
  assert.match(leer('Frontend/Cajero/cajero.html'), /dividir_cuenta\.html/);
  assert.match(leer('Frontend/js/caja.js'), /dividir_cuenta\.html\?id_cuenta=/);
});

test('20: la API de caja se registra en Express', () => {
  assert.match(leer('backend/src/app.js'), /app\.use\(['"]\/api\/cajero['"],\s*cajeroRoutes\)/);
});

test('20: todos los endpoints de caja requieren JWT y rol', () => {
  const routes = leer('backend/src/routes/cajero.routes.js');
  const guard = routes.indexOf("router.use(autenticarPersonal, autorizarRoles('cajero', 'administrador'))");
  const primero = routes.indexOf("router.get('/turnos/actual'");
  assert.ok(guard >= 0 && primero > guard, 'Falta proteccion global o esta despues de las rutas');
});

test('20: existen los endpoints de apertura, arqueo y movimientos', () => {
  const routes = leer('backend/src/routes/cajero.routes.js');
  for (const fragmento of [
    "router.get('/turnos/actual'", "router.post('/turnos'",
    "router.get('/turnos/actual/arqueo'", "router.post('/turnos/:id/cerrar'",
    "router.get('/turnos/actual/movimientos'", "router.post('/turnos/actual/movimientos'",
  ]) assert.ok(routes.includes(fragmento), `Falta ruta ${fragmento}`);
});

test('20: existen todos los endpoints de cuentas divididas', () => {
  const routes = leer('backend/src/routes/cajero.routes.js');
  for (const fragmento of [
    "router.get('/cuentas/:id/subcuentas'", "router.post('/cuentas/:id/subcuentas'",
    "router.post('/cuentas/:id/subcuentas/:idSubcuenta/detalles'",
    "router.delete('/cuentas/:id/subcuentas/:idSubcuenta/detalles/:idAsignacion'",
    "router.post('/cuentas/:id/subcuentas/:idSubcuenta/pagos'",
  ]) assert.ok(routes.includes(fragmento), `Falta ruta ${fragmento}`);
});

test('20: las rutas admin protegen el dashboard despues del login', () => {
  const routes = leer('backend/src/routes/admin.routes.js');
  const guard = routes.indexOf("router.use(autenticarPersonal, autorizarRoles('administrador'))");
  assert.ok(guard > routes.indexOf("router.post('/login'"));
  assert.ok(guard < routes.indexOf("router.get('/dashboard'"));
});

test('20: los importes de los pedidos usan el precio del catalogo', () => {
  const src = leer('backend/src/controllers/pedidos.controller.js');
  assert.match(src, /cantidad\s*\*\s*producto\.precioCentavos/);
  assert.match(src, /importePedidoCentavos\(producto\.precioCentavos\)/);
});

test('20: el cobro usa turnos, idempotencia y efectivo del backend', () => {
  const src = leer('backend/src/controllers/cajero.controller.js');
  for (const palabra of ['pg_advisory_xact_lock', 'idempotency_hash', 'idempotency_key', 'monto_recibido', 'id_turno', 'id_subcuenta']) {
    assert.ok(src.includes(palabra), `Falta ${palabra}`);
  }
});

test('20: la interfaz conserva el saldo reservado para subcuentas', () => {
  const src = leer('Frontend/js/caja.js');
  assert.match(src, /monto_libre/);
  assert.match(src, /monto_pendiente/);
});

test('20: la division de cuenta conserva los reintentos del mismo pago', () => {
  const src = leer('Frontend/js/subcuentas-caja.js');
  assert.match(src, /sessionStorage/);
  assert.match(src, /idempotency_key/);
});

test('20: esquema SQL crea turnos, movimientos y subcuentas', () => {
  assert.match(sqlPrincipal('turnos_caja'), /CREATE TABLE IF NOT EXISTS public\.turnos_caja/i);
  assert.match(sqlPrincipal('movimientos_caja'), /CREATE TABLE IF NOT EXISTS public\.movimientos_caja/i);
  assert.match(sqlPrincipal('subcuentas'), /CREATE TABLE IF NOT EXISTS public\.subcuentas/i);
  assert.match(sqlPrincipal('subcuentas'), /CREATE TABLE IF NOT EXISTS public\.subcuenta_detalle/i);
});

test('20: SQL protege pagos duplicados y guarda datos de arqueo', () => {
  assert.match(sqlPrincipal('idempotencia_pagos'), /UNIQUE INDEX IF NOT EXISTS/i);
  assert.match(sqlPrincipal('cierre_idempotente'), /idempotency_key/i);
  assert.match(sqlPrincipal('subcuentas'), /CREATE OR REPLACE VIEW public\.v_subcuentas_resumen/i);
});

test('20: el corte antiguo excluye pagos con turno moderno', () => {
  assert.match(leer('backend/src/controllers/cajero.controller.js'), /pg\.id_turno IS NULL/);
});

test('20: los eventos SSE no publican datos privados de cobro', () => {
  const app = leer('backend/src/app.js');
  assert.match(app, /onPagoRegistrado\s*=\s*\(\)\s*=>\s*sendEvent\(\{\s*type:\s*'pago:registrado',\s*data:\s*\{\}/);
});

test('20: el workflow ejecuta tests y verifica la sintaxis', () => {
  const workflow = leer('.github/workflows/pruebas-cajero.yml');
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /node --test backend\/test\/\*\.test\.cjs/);
  assert.match(workflow, /node --check/);
});

test('20: existe la documentacion de integracion y liberacion', () => {
  for (const archivo of ['README.md', 'docs/CHECKLIST_QA_CAJERO.md', 'docs/RELEASE_NOTES_CAJERO_v1.0.0.md', 'docs/COMMIT_20_RELEASE_MERGE.md', '.github/PULL_REQUEST_TEMPLATE.md']) {
    assert.ok(existe(archivo), `Falta ${archivo}`);
  }
});

test('20: smoke HTTP solo ejecuta GET y nunca altera dinero', () => {
  const src = leer('backend/scripts/release-smoke.cjs');
  assert.match(src, /method:\s*'GET'/);
  assert.doesNotMatch(src, /method:\s*'(POST|PUT|PATCH|DELETE)'/);
});

test('20: el smoke no envia JWT por HTTP a dominios remotos', () => {
  const { validarDestino } = require('../scripts/release-smoke.cjs');
  assert.equal(validarDestino('http://localhost:4000', 'demo'), 'http://localhost:4000');
  assert.equal(validarDestino('https://menu.example.com', 'demo'), 'https://menu.example.com');
  assert.throws(() => validarDestino('http://menu.example.com', 'demo'), /HTTPS/);
  assert.throws(() => validarDestino('http://localhost:4000/api', ''), /origen/);
});

test('20: existe consulta SQL de auditoria de solo lectura', () => {
  const src = leer('database/20261020_cajero_release_verificacion.sql');
  for (const nombre of ['turnos_caja', 'movimientos_caja', 'subcuentas', 'idempotency_key']) {
    assert.ok(src.includes(nombre), `Falta ${nombre} en el chequeo SQL`);
  }
  assert.doesNotMatch(src, /\b(DROP|DELETE|TRUNCATE|ALTER|UPDATE|INSERT)\s+(TABLE|SCHEMA|FROM|INTO|public)/i);
});
