'use strict';

// Prueba el verificador de release contra un servidor HTTP simulado y local.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

const comando = path.resolve(__dirname, '../scripts/release-smoke.cjs');

async function conServidor(responder, callback) {
  const rutas = [];
  const servidor = http.createServer((req, res) => {
    rutas.push({ method: req.method, url: req.url });
    responder(req, res);
  });
  await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
  const direccion = servidor.address();
  try {
    return await callback(`http://127.0.0.1:${direccion.port}`, rutas);
  } finally {
    await new Promise(resolve => servidor.close(resolve));
  }
}

function ejecutar(origen) {
  return new Promise((resolve, reject) => {
    const hijo = spawn(process.execPath, [comando], {
      env: { ...process.env, MENUGO_BASE_URL: origen, MENUGO_CAJERO_TOKEN: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    hijo.stdout.setEncoding('utf8');
    hijo.stderr.setEncoding('utf8');
    hijo.stdout.on('data', x => { out += x; });
    hijo.stderr.on('data', x => { err += x; });
    hijo.on('error', reject);
    hijo.on('close', code => resolve({ code, out, err }));
  });
}

test('20: smoke HTTP pasa si API de salud esta OK y las rutas privadas exigen JWT', async () => {
  await conServidor((req, res) => {
    const esSalud = req.url === '/api/health';
    res.writeHead(esSalud ? 200 : 401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: esSalud }));
  }, async (origen, rutas) => {
    const resultado = await ejecutar(origen);
    assert.equal(resultado.code, 0, resultado.out + resultado.err);
    assert.match(resultado.out, /Smoke HTTP correcto/);
    assert.equal(rutas.length, 7);
    assert.ok(rutas.every(x => x.method === 'GET'));
  });
});

test('20: smoke HTTP falla ante ruta protegida que responde 200 sin JWT', async () => {
  await conServidor((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }, async (origen) => {
    const resultado = await ejecutar(origen);
    assert.equal(resultado.code, 1);
    assert.match(resultado.out + resultado.err, /ERROR/);
  });
});
