'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { verificarEstructuraPDF, datosDemostracion } = require('../scripts/ticket-release-check.cjs');

const ROOT = path.resolve(__dirname, '../..');
const leer = (ruta) => fs.readFileSync(path.join(ROOT, ruta), 'utf8');
const pdfFalso = (ancho, alto = 240) => Buffer.from(
  `%PDF-1.7\n1 0 obj\n<< /MediaBox [0 0 ${ancho} ${alto}] >>\nendobj\n` +
  'a'.repeat(600) + '\n%%EOF\n', 'latin1'
);

test('24: GitHub Actions corre con push de la rama tickets y PR hacia main', () => {
  const flujo = leer('.github/workflows/pruebas-cajero.yml');
  assert.match(flujo, /push:\s*\n\s*branches:/);
  assert.match(flujo, /feature\/cajero-tickets/);
  assert.match(flujo, /feature\/cajero-mejoras/);
  assert.match(flujo, /pull_request:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(flujo, /workflow_dispatch:/);
});

test('24: CI instala dependencias exactas y ejecuta sintaxis, tests y PDF real', () => {
  const flujo = leer('.github/workflows/pruebas-cajero.yml');
  assert.match(flujo, /node-version: '20'/);
  assert.match(flujo, /backend\/package-lock\.json/);
  assert.match(flujo, /npm ci --prefix backend/);
  assert.match(flujo, /node --check/);
  assert.match(flujo, /node --test backend\/test\/\*\.test\.cjs/);
  assert.match(flujo, /node backend\/scripts\/ticket-release-check\.cjs/);
});

test('24: las dependencias contienen PDFKit y un lockfile', () => {
  const paquete = JSON.parse(leer('backend/package.json'));
  assert.ok(paquete.dependencies.pdfkit, 'No esta declarada la dependencia pdfkit');
  const bloqueo = JSON.parse(leer('backend/package-lock.json'));
  assert.equal(bloqueo.packages[''].dependencies.pdfkit, paquete.dependencies.pdfkit);
});

test('24: verificador detecta PDFs de ancho 58 y 80 mm', () => {
  const pdf58 = verificarEstructuraPDF(pdfFalso(58 * 72 / 25.4), 58);
  const pdf80 = verificarEstructuraPDF(pdfFalso(80 * 72 / 25.4), 80);
  assert.equal(pdf58.formatoMm, 58);
  assert.equal(pdf80.formatoMm, 80);
  assert.ok(pdf80.anchoPt > pdf58.anchoPt);
});

test('24: verificador rechaza archivos con PDF falso, incompleto o ancho incorrecto', () => {
  assert.throws(() => verificarEstructuraPDF(Buffer.from('no es pdf'), 80), /completo/);
  assert.throws(() => verificarEstructuraPDF(Buffer.from('NOTPDF\n' + 'x'.repeat(600) + '\n%%EOF'), 58), /cabecera/);
  assert.throws(() => verificarEstructuraPDF(Buffer.from('%PDF-1.7\n' + 'x'.repeat(600)), 80), /cierre/);
  assert.throws(() => verificarEstructuraPDF(pdfFalso(100), 80), /ancho termico/);
  assert.throws(() => verificarEstructuraPDF(pdfFalso(58 * 72 / 25.4, 50), 58), /altura/);
  assert.throws(() => verificarEstructuraPDF(pdfFalso(58 * 72 / 25.4), 82), /58 u 80/);
});

test('24: casos del smoke incluyen pago completo, parcial y 58/80 mm', () => {
  const casos = datosDemostracion();
  assert.equal(casos.length, 3);
  assert.deepEqual(new Set(casos.map(x => x.ancho)), new Set([58, 80]));
  assert.ok(casos.some(x => x.tipo === 'pago_parcial'));
  assert.ok(casos.every(x => x.pago.estado_pago === 'pagado'));
});

test('24: el smoke no escribe en base de datos ni realiza operaciones HTTP', () => {
  const codigo = leer('backend/scripts/ticket-release-check.cjs');
  assert.doesNotMatch(codigo, /\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b\s+(?:INTO|FROM|TABLE|public)/i);
  assert.doesNotMatch(codigo, /\b(?:fetch|axios|client\.query|pool\.query)\s*\(/i);
  assert.match(codigo, /crearDocumentoTicket/);
  assert.match(codigo, /verificarTicketsReales/);
});

test('24: la descarga de tickets sigue siendo GET protegido por rol', () => {
  const rutas = leer('backend/src/routes/cajero.routes.js');
  const controlador = leer('backend/src/controllers/ticket.controller.js');
  assert.match(rutas, /router\.use\(autenticarPersonal, autorizarRoles\('cajero', 'administrador'\)\)/);
  assert.match(rutas, /router\.get\('\/pagos\/:id\/ticket\.pdf', ticketController\.descargarTicketPDF\)/);
  assert.match(controlador, /Solo puedes imprimir tus propios pagos/);
  assert.match(controlador, /estado_pago !== 'pagado'/);
  assert.match(controlador, /private, no-store/);
});

test('24: el simulador y los historiales no realizan nuevos cobros', () => {
  const componentes = ['Frontend/js/ticket-virtual.js', 'Frontend/js/historial-tickets.js'];
  for (const ruta of componentes) {
    const codigo = leer(ruta);
    assert.doesNotMatch(codigo, /method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
    assert.doesNotMatch(codigo, /localStorage\.setItem\s*\(/);
  }
  assert.match(leer('Frontend/Cajero/impresora_virtual.html'), /Ctrl \+ P/);
});

test('24: manual y checklist de tickets estan versionados', () => {
  const rutas = [
    'docs/MODULO_TICKETS_CAJERO.md',
    'docs/CHECKLIST_QA_TICKETS.md',
    'docs/COMMIT_24_CIERRE_TICKETS.md',
  ];
  for (const ruta of rutas) assert.ok(fs.existsSync(path.join(ROOT, ruta)), `Falta ${ruta}`);
  assert.match(leer('docs/MODULO_TICKETS_CAJERO.md'), /SUNAT/);
});
