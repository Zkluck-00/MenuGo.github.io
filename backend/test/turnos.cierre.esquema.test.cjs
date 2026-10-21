'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root = path.resolve(__dirname, '../..');
// La migracion puede utilizar un nombre con fecha o sin fecha.
const migrationFile = ['20261020_cajero_cierre_idempotente.sql', 'cajero_cierre_idempotente.sql']
  .map(nombre => path.join(root, 'database', nombre))
  .find(archivo => fs.existsSync(archivo));
assert.ok(migrationFile, 'No existe la migracion de cierre idempotente en database/');
const sql = fs.readFileSync(migrationFile, 'utf8');
const validacion=fs.readFileSync(path.resolve(__dirname,'../../database/20261020_cajero_cierre_verificacion.sql'),'utf8');
test('migracion SQL transaccional y no destructiva',()=>{
  assert.match(sql,/\bBEGIN;/);assert.match(sql,/\bCOMMIT;/);
  assert.doesNotMatch(sql,/\b(DROP|TRUNCATE|DELETE FROM)\b/i);
});
test('preserva observaciones de apertura y agrega las de cierre',()=>{
  assert.match(sql,/ADD COLUMN IF NOT EXISTS observaciones_cierre/);
  assert.match(sql,/COMMENT ON COLUMN public\.turnos_caja\.observaciones_cierre/);
});
test('restriccion e indice unico para reintentos del cierre',()=>{
  assert.match(sql,/ADD CONSTRAINT ck_turnos_cierre_idempotente/);
  assert.match(sql,/cierre_idempotency_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS ux_turnos_cierre_idempotency_key/);
});
test('la migracion tiene precondicion de movimientos y turnos',()=>{
  assert.match(sql,/to_regclass\('public\.turnos_caja'\)/);
  assert.match(sql,/to_regclass\('public\.movimientos_caja'\)/);
});
test('consultas de verificacion comprueban esquema e historial',()=>{
  assert.match(validacion,/information_schema\.columns/);
  assert.match(validacion,/pg_indexes/);assert.match(validacion,/public\.turnos_caja/);
});
