'use strict';

// MenuGo - Commit 14: pruebas estructurales de la migracion SQL.
// No conectan a Neon ni ejecutan DDL: comprobar la BD real con el SQL de
// verificacion y en una rama Neon de desarrollo antes de publicar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const migrationFile = path.join(root, 'database', '20261020_cajero_movimientos_caja.sql');
const verificationFile = path.join(root, 'database', '20261020_cajero_movimientos_verificacion.sql');

const sql = fs.readFileSync(migrationFile, 'utf8');
const verification = fs.readFileSync(verificationFile, 'utf8');
const withoutComments = (value) => value.replace(/^\s*--.*$/gm, '');
const ddl = withoutComments(sql);

const matches = (pattern, value = ddl) => assert.match(value, pattern);

test('14: la migracion contiene una unica transaccion', () => {
  matches(/^\s*BEGIN\s*;/i);
  matches(/\bCOMMIT\s*;\s*$/i);
  assert.equal((ddl.match(/\bBEGIN\s*;/gi) || []).length, 1);
  assert.equal((ddl.match(/\bCOMMIT\s*;/gi) || []).length, 1);
});

test('14: no se eliminan ni truncan tablas ni datos existentes', () => {
  assert.doesNotMatch(ddl, /\bDROP\s+(TABLE|SCHEMA)\b/i);
  assert.doesNotMatch(ddl, /\bTRUNCATE\s+(TABLE\s+)?/i);
  assert.doesNotMatch(ddl, /\bDELETE\s+FROM\b/i);
});

test('14: se comprueban dependencias del commit 12', () => {
  matches(/to_regclass\s*\(\s*'public\.turnos_caja'\s*\)/i);
  matches(/to_regclass\s*\(\s*'public\.trabajador'\s*\)/i);
});

test('14: crea una tabla independiente sin modificar pagos', () => {
  matches(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.movimientos_caja\s*\(/i);
  assert.doesNotMatch(ddl, /ALTER\s+TABLE\s+public\.pagos\b/i);
});

test('14: el esquema exige monto positivo y dos decimales', () => {
  matches(/monto\s+NUMERIC\s*\(\s*12\s*,\s*2\s*\)\s+NOT\s+NULL/i);
  matches(/CONSTRAINT\s+ck_movimientos_caja_monto_positivo\s+CHECK\s*\(\s*monto\s*>\s*0\s*\)/i);
});

test('14: los movimientos guardan turno, registrador y fecha', () => {
  matches(/id_turno\s+BIGINT\s+NOT\s+NULL/i);
  matches(/id_registrado_por\s+INTEGER\s+NOT\s+NULL/i);
  matches(/registrado_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP/i);
});

test('14: las FK impiden perder turnos o trabajadores referenciados', () => {
  matches(/CONSTRAINT\s+fk_movimientos_caja_turno[\s\S]*?REFERENCES\s+public\.turnos_caja\s*\(\s*id_turno\s*\)\s+ON\s+DELETE\s+RESTRICT/i);
  matches(/CONSTRAINT\s+fk_movimientos_caja_registrador[\s\S]*?REFERENCES\s+public\.trabajador\s*\(\s*idtrabajador\s*\)\s+ON\s+DELETE\s+RESTRICT/i);
});

test('14: hay categorias distintas segun ingreso o retiro', () => {
  matches(/tipo\s*=\s*'ingreso'\s+AND\s+categoria\s+IN\s*\(\s*'reposicion'\s*,\s*'ajuste'\s*,\s*'otro'\s*\)/i);
  matches(/tipo\s*=\s*'retiro'\s+AND\s+categoria\s+IN\s*\(\s*'gasto'\s*,\s*'retiro_banco'\s*,\s*'ajuste'\s*,\s*'otro'\s*\)/i);
});

test('14: el motivo es obligatorio, no vacio y tiene longitud limitada', () => {
  matches(/motivo\s+TEXT\s+NOT\s+NULL/i);
  matches(/char_length\s*\(\s*btrim\s*\(\s*motivo\s*\)\s*\)\s+BETWEEN\s+5\s+AND\s+300/i);
});

test('14: se requieren clave y huella juntas si se utiliza idempotencia', () => {
  matches(/idempotency_key\s+VARCHAR\s*\(\s*100\s*\)/i);
  matches(/idempotency_hash\s+VARCHAR\s*\(\s*64\s*\)/i);
  matches(/idempotency_key\s+IS\s+NULL\s+AND\s+idempotency_hash\s+IS\s+NULL/i);
  matches(/idempotency_hash\s*~\s*'\^\[0-9a-f\]\{64\}\$'/i);
});

test('14: un indice unico evita duplicar la clave de movimiento', () => {
  matches(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+ux_movimientos_caja_idempotency_key/i);
  matches(/ON\s+public\.movimientos_caja\s*\(\s*idempotency_key\s*\)\s+WHERE\s+idempotency_key\s+IS\s+NOT\s+NULL/i);
});

test('14: indice por turno y fecha facilita historial y arqueo', () => {
  matches(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_movimientos_caja_turno_fecha/i);
  matches(/\(id_turno,\s*registrado_at\s+DESC,\s*id_movimiento\s+DESC\)/i);
});

test('14: el trigger impide UPDATE y DELETE de movimientos', () => {
  matches(/TG_OP\s*<>\s*'INSERT'/i);
  matches(/BEFORE\s+INSERT\s+OR\s+UPDATE\s+OR\s+DELETE\s+ON\s+public\.movimientos_caja/i);
});

test('14: el trigger bloquea el turno y solo acepta turnos abiertos', () => {
  matches(/FROM\s+public\.turnos_caja\s+WHERE\s+id_turno\s*=\s*NEW\.id_turno\s+FOR\s+UPDATE/i);
  matches(/v_estado\s*<>\s*'abierto'/i);
  matches(/NEW\.registrado_at\s*:=\s*CURRENT_TIMESTAMP/i);
});

test('14: la vista separa ingresos y retiros sin duplicar ventas', () => {
  const view = ddl.split(/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.v_resumen_movimientos_caja\s+AS/i)[1]?.split(/COMMENT\s+ON\s+TABLE/i)[0];
  assert.ok(view, 'No se encontro la vista de resumen');
  matches(/SUM\s*\(\s*m\.monto\s*\)\s+FILTER\s*\(\s*WHERE\s+m\.tipo\s*=\s*'ingreso'\s*\)/i, view);
  matches(/SUM\s*\(\s*m\.monto\s*\)\s+FILTER\s*\(\s*WHERE\s+m\.tipo\s*=\s*'retiro'\s*\)/i, view);
  assert.doesNotMatch(view, /\bJOIN\s+public\.pagos\b/i);
});

test('14: vista incluye turnos sin movimientos mediante LEFT JOIN', () => {
  matches(/LEFT\s+JOIN\s+public\.movimientos_caja\s+m\s+ON\s+m\.id_turno\s*=\s*t\.id_turno/i);
  matches(/COUNT\s*\(\s*m\.id_movimiento\s*\)\s*::\s*INTEGER/i);
});

test('14: puede reejecutarse evitando duplicar trigger y restricciones', () => {
  matches(/IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+pg_trigger/i);
  assert.ok((ddl.match(/IF\s+NOT\s+EXISTS\s*\(/gi) || []).length >= 8);
});

test('14: el archivo de verificacion es de solo lectura', () => {
  const check = withoutComments(verification);
  assert.doesNotMatch(check, /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\s+(INTO|FROM|TABLE|VIEW|INDEX|SCHEMA)?/i);
  assert.ok((check.match(/\bSELECT\b/gi) || []).length >= 6);
  matches(/JOIN\s+public\.v_resumen_movimientos_caja/i, check);
});
