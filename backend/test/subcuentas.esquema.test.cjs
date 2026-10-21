'use strict';

// Commit 17: tests ESTATICOS del contrato SQL; no conectan a Neon.
// El archivo *_verificacion.sql se debe ejecutar en una BD de desarrollo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const sql = fs.readFileSync(path.join(root, 'database', '20261020_cajero_subcuentas.sql'), 'utf8');
const verification = fs.readFileSync(path.join(root, 'database', '20261020_cajero_subcuentas_verificacion.sql'), 'utf8');
const ddl = sql.replace(/^\s*--.*$/gm, '');
const has = (pattern, value = ddl) => assert.match(value, pattern);

test('17: migracion inicia y termina en una transaccion', () => {
  has(/^\s*BEGIN\s*;/i);
  has(/\bCOMMIT\s*;\s*$/i);
  assert.equal((ddl.match(/^BEGIN\s*;/gmi) || []).length, 1);
  assert.equal((ddl.match(/^COMMIT\s*;/gmi) || []).length, 1);
});

test('17: no elimina ni trunca esquemas o datos', () => {
  assert.doesNotMatch(ddl, /\bDROP\s+(SCHEMA|TABLE|VIEW)\b/i);
  assert.doesNotMatch(ddl, /\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
});

test('17: revisa dependencias del modelo existente', () => {
  for (const name of ['cuentas', 'pedidos', 'detalle_producto', 'pagos', 'detalle_pago', 'trabajador']) {
    has(new RegExp(`to_regclass\\('public\\.${name}'\\)`, 'i'));
  }
});

test('17: crea tabla de personas dentro de la cuenta', () => {
  has(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.subcuentas\s*\(/i);
  has(/id_subcuenta\s+BIGSERIAL\s+PRIMARY\s+KEY/i);
  has(/id_cuenta\s+INTEGER\s+NOT\s+NULL/i);
  has(/nombre\s+VARCHAR\s*\(\s*80\s*\)\s+NOT\s+NULL/i);
});

test('17: FK a cuentas impide borrar cuenta con subcuentas', () => {
  has(/CONSTRAINT\s+fk_subcuentas_cuenta[\s\S]*?REFERENCES\s+public\.cuentas\s*\(id_cuenta\)\s+ON\s+DELETE\s+RESTRICT/i);
});

test('17: referencia al trabajador que creo la division', () => {
  has(/id_creada_por\s+INTEGER/i);
  has(/CONSTRAINT\s+fk_subcuentas_creador[\s\S]*?REFERENCES\s+public\.trabajador\s*\(idtrabajador\)/i);
});

test('17: estados posibles de subcuenta estan restringidos', () => {
  has(/CHECK\s*\(estado\s+IN\s*\('pendiente',\s*'pagada',\s*'anulada'\)\)/i);
  has(/CHECK\s*\(char_length\s*\(btrim\s*\(nombre\)\)\s+BETWEEN\s+1\s+AND\s+80\)/i);
});

test('17: nombre unico dentro de cuenta ignorando mayusculas y espacios', () => {
  has(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+ux_subcuentas_nombre_activo/i);
  has(/lower\s*\(btrim\s*\(nombre\)\)/i);
});

test('17: crea lineas de reparto sobre productos existentes', () => {
  has(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.subcuenta_detalle\s*\(/i);
  has(/id_detalle_producto\s+INTEGER\s+NOT\s+NULL/i);
  has(/monto_asignado\s+NUMERIC\s*\(12,2\)\s+NOT\s+NULL/i);
  has(/cantidad_asignada\s+NUMERIC\s*\(10,3\)/i);
});

test('17: un mismo detalle puede asignarse a varias personas pero una vez por persona', () => {
  has(/UNIQUE\s*\(id_subcuenta,\s*id_detalle_producto\)/i);
  has(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_subcuenta_detalle_producto/i);
});

test('17: importe positivo y cantidad opcional positiva', () => {
  has(/CHECK\s*\(monto_asignado\s*>\s*0\)/i);
  has(/CHECK\s*\(cantidad_asignada\s+IS\s+NULL\s+OR\s+cantidad_asignada\s*>\s*0\)/i);
});

test('17: productos y participantes referenciados no se borran en cascada', () => {
  has(/CONSTRAINT\s+fk_subcuenta_detalle_subcuenta[\s\S]*?ON\s+DELETE\s+RESTRICT/i);
  has(/CONSTRAINT\s+fk_subcuenta_detalle_producto[\s\S]*?ON\s+DELETE\s+RESTRICT/i);
});

test('17: pagos historicos conservan id_subcuenta opcional', () => {
  has(/ALTER\s+TABLE\s+public\.pagos\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+id_subcuenta\s+BIGINT/i);
  assert.doesNotMatch(ddl, /UPDATE\s+public\.pagos\b/i);
});

test('17: FK compuesta impide asociar persona de otra cuenta', () => {
  has(/FOREIGN\s+KEY\s*\(id_cuenta,\s*id_subcuenta\)\s*REFERENCES\s+public\.subcuentas\s*\(id_cuenta,\s*id_subcuenta\)/i);
  has(/CONSTRAINT\s+uq_subcuentas_cuenta_id\s+UNIQUE\s*\(id_cuenta,\s*id_subcuenta\)/i);
});

test('17: crea indice para obtener pagos por persona', () => {
  has(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_pagos_subcuenta_estado/i);
});

test('17: no permite nuevos participantes en cuentas pagadas', () => {
  has(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_proteger_subcuenta\s*\(/i);
  has(/v_estado_cuenta\s+IS\s+DISTINCT\s+FROM\s+'pendiente'/i);
  has(/CREATE\s+TRIGGER\s+trg_proteger_subcuenta\s+BEFORE\s+INSERT\s+OR\s+UPDATE\s+OR\s+DELETE/i);
});

test('17: no permite editar historial pagado ni borrar subcuentas', () => {
  has(/IF\s+TG_OP\s*=\s*'DELETE'\s+THEN[\s\S]*?no se eliminan subcuentas/i);
  has(/OLD\.estado\s+IN\s*\('pagada',\s*'anulada'\)/i);
});

test('17: una subcuenta solo puede marcarse pagada al completar su importe', () => {
  has(/OLD\.estado\s*<>\s*'pagada'\s+AND\s+NEW\.estado\s*=\s*'pagada'/i);
  has(/v_total_pagado\s*<>\s*v_total_asignado/i);
  has(/estado_pago\s*=\s*'pagado'/i);
});

test('17: bloquea cuenta y producto para asignaciones concurrentes', () => {
  has(/public\.cuentas\s+WHERE\s+id_cuenta\s*=\s*v_id_cuenta\s+FOR\s+UPDATE/i);
  has(/FOR\s+UPDATE\s+OF\s+dp/i);
});

test('17: solo admite productos del mismo grupo y pedidos no cancelados', () => {
  has(/v_grupo_producto\s+IS\s+DISTINCT\s+FROM\s+v_grupo/i);
  has(/v_estado_pedido\s*=\s*'cancelado'/i);
});

test('17: reserva monto considerando pagos previos libres y otras personas', () => {
  has(/v_pagado_libre\s*\+\s*v_ya_asignado\s*\+\s*NEW\.monto_asignado\s*>\s*v_subtotal/i);
  has(/v_ya_cantidad\s*\+\s*NEW\.cantidad_asignada\s*>\s*v_cantidad/i);
  has(/pg\.id_subcuenta\s+IS\s+NULL/i);
});

test('17: impide cambiar asignaciones tras recibir pagos de la persona', () => {
  has(/TG_OP\s*<>\s*'INSERT'\s+AND\s+EXISTS/i);
  has(/id_subcuenta\s*=\s*v_id_subcuenta[\s\S]*?estado_pago\s+IN\s*\('pendiente',\s*'pagado'\)/i);
});

test('17: pagos etiquetados no superan el total asignado a esa persona', () => {
  has(/CREATE\s+TRIGGER\s+trg_validar_pago_subcuenta/i);
  has(/v_total_otros_pagos\s*\+\s*NEW\.monto\s*>\s*v_total_asignado/i);
});

test('17: pagos solo usan los items asignados a la persona', () => {
  has(/CREATE\s+TRIGGER\s+trg_validar_detalle_pago_subcuentas/i);
  has(/v_pagado_persona\s*\+\s*NEW\.monto\s*>\s*v_asignado_persona/i);
  has(/v_asignado_total\s*\+\s*v_pagado_libre\s*\+\s*NEW\.monto\s*>\s*v_total_producto/i);
});

test('17: crea vistas de lectura sin duplicar importes por joins', () => {
  has(/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.v_subcuentas_resumen/i);
  has(/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.v_distribucion_cuenta/i);
  has(/LEFT\s+JOIN\s+LATERAL/i);
});

test('17: la verificacion SQL no escribe en Neon', () => {
  assert.doesNotMatch(verification.replace(/^\s*--.*$/gm, ''), /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\s+(INTO|TABLE|FROM|SCHEMA|OR\s+REPLACE)/i);
  assert.match(verification, /public\.v_subcuentas_resumen/);
  assert.match(verification, /public\.v_distribucion_cuenta/);
});

test('17: la migracion reutiliza el esquema sin cambiar cuentas ni detalle_producto', () => {
  assert.doesNotMatch(ddl, /ALTER\s+TABLE\s+public\.cuentas\b/i);
  assert.doesNotMatch(ddl, /ALTER\s+TABLE\s+public\.detalle_producto\b/i);
  assert.doesNotMatch(ddl, /ALTER\s+TABLE\s+public\.detalle_pago\b/i);
});
