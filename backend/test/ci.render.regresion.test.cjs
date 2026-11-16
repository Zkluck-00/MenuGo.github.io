'use strict';

// Estas pruebas detectan dos errores que anteriormente pasaban desapercibidos:
// 1) Frontend de Cocina con codigo duplicado que impide la carga de JS.
// 2) Rutas Express que pasan node --check pero fallan al ser evaluadas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const base = path.resolve(__dirname, '../..');
const source = (relative) => fs.readFileSync(path.join(base, relative), 'utf8');

test('CI: frontend de Cocina pasa la carga sintactica completa', () => {
  const cocina = source('Frontend/js/cocina.js');
  assert.doesNotThrow(() => new vm.Script(cocina, { filename: 'Frontend/js/cocina.js' }));
  assert.equal((cocina.match(/\bconst pedidosFiltrados\s*=/g) || []).length, 1,
    'No debe declarar pedidosFiltrados dos veces dentro de la misma funcion');
  assert.match(cocina, /\.filter\(coincideBusquedaCocina\)/);
  assert.match(cocina, /\.filter\(coincideTipoCocina\)/);
  assert.match(cocina, /\.sort\(compararPedidosCocina\)/);
});

test('CI: ruta del ticket referencia un controlador efectivamente importado', () => {
  const code = source('backend/src/routes/cajero.routes.js');
  const registrations = [];
  const handler = () => {};
  const noop = () => {};
  const router = {};
  for (const verb of ['get', 'post', 'patch', 'delete']) {
    router[verb] = (url, ...handlers) => { registrations.push({ verb, url, handlers }); return router; };
  }
  router.use = () => router;
  const fallbackController = new Proxy({}, { get: () => noop });
  const mocks = {
    express: { Router: () => router },
    '../controllers/ticket.controller': { descargarTicketPDF: handler },
    '../middleware/auth.middleware': { autenticarPersonal: noop, autorizarRoles: () => noop },
  };
  const sandbox = {
    module: { exports: null },
    exports: {},
    require(mod) {
      if (Object.prototype.hasOwnProperty.call(mocks, mod)) return mocks[mod];
      if (mod.startsWith('../controllers/')) return fallbackController;
      throw new Error(`Importacion de prueba inesperada: ${mod}`);
    },
  };
  assert.doesNotThrow(() => vm.runInNewContext(code, sandbox, {
    filename: 'backend/src/routes/cajero.routes.js', timeout: 2000,
  }));
  assert.equal(sandbox.module.exports, router);
  const ticket = registrations.find(item => item.verb === 'get' && item.url === '/pagos/:id/ticket.pdf');
  assert.ok(ticket, 'La ruta PDF del Cajero tiene que estar registrada');
  assert.equal(ticket.handlers.at(-1), handler);
});

test('CI: rutas de caja siguen incluyendo turnos y movimientos', () => {
  const code = source('backend/src/routes/cajero.routes.js');
  for (const route of ["'/turnos/actual'", "'/turnos'", "'/turnos/actual/movimientos'", "'/pagos/:id/ticket.pdf'"]) {
    assert.ok(code.includes(route), `Se perdio la ruta ${route}`);
  }
});
