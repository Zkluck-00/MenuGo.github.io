'use strict';
// Commit 16: pruebas del cierre con PostgreSQL simulado y aislamiento concurrente.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const codigo = fs.readFileSync(path.resolve(__dirname, '../src/controllers/turnos-cierre.controller.js'), 'utf8');
const rutas = fs.readFileSync(path.resolve(__dirname, '../src/routes/cajero.routes.js'), 'utf8');
const pago = fs.readFileSync(path.resolve(__dirname, '../src/controllers/cajero.controller.js'), 'utf8');
const movimiento = fs.readFileSync(path.resolve(__dirname, '../src/controllers/movimientos-caja.controller.js'), 'utf8');
const CLAVE = '2ad04d83-7467-4fb5-9adb-ce1010247777';
const cajero = { rol:'cajero', id_trabajador: 8, nombre:'Caja Test' };
function respuesta() { return { codigo:200, datos:null, status(c) { this.codigo=c;return this; }, json(v) {this.datos=v;return this;} }; }
function body(overrides={}) { return { efectivo_contado:'190.25', observaciones_cierre:'Arqueo con faltante', idempotency_key:CLAVE, ...overrides }; }

function simular({
  existe=true, estado='abierto', idCajero=8, error=null, base='100.00', cash='80.25',
  ingresos='20.00', retiros='5.00', digital='50.00', bloqueo=false,
}={}) {
  let proximoBloqueo = Promise.resolve();
  const consultas=[]; const historico=[];
  const turno = existe ? {
    id_turno:51, id_cajero:idCajero, estado, fondo_inicial:base,
    abierto_at:'2026-10-20T14:00:00Z', cerrado_at:estado==='cerrado'?'2026-10-20T17:00:00Z':null,
    efectivo_esperado: estado==='cerrado' ? '195.25' : null,
    efectivo_contado: estado==='cerrado' ? '190.25' : null,
    diferencia:estado==='cerrado'?'-5.00':null,
    observaciones:'Fondo inicial comprobado', observaciones_cierre:null,
    cierre_idempotency_key:null, cierre_idempotency_hash:null,
  } : null;
  const cajaDisponible = () => (Number(base)+Number(cash)+Number(ingresos)-Number(retiros)).toFixed(2);
  const resumen = () => ({ ...turno, cantidad_pagos:3, total_cobrado:(Number(cash)+Number(digital)).toFixed(2),
    ventas_efectivo:cash, ventas_yape:digital, ventas_plin:'0.00',
    ventas_tarjeta_credito:'0.00', ventas_tarjeta_debito:'0.00',
    total_ingresos:ingresos, total_retiros:retiros, cantidad_movimientos:2,
    efectivo_teorico:cajaDisponible() });
  const ejecutarConsulta = async (sql, params = [], client=null) => {
    const t = String(sql).trim(); consultas.push({sql:t,params});
    if (t === 'BEGIN') { client.tx=true; return {rows:[]}; }
    if (t === 'COMMIT' || t === 'ROLLBACK') {
      client.tx=false;
      if (client.liberar) { client.liberar(); client.liberar=null; }
      return {rows:[]};
    }
    if (/FROM public\.turnos_caja\s+WHERE id_turno = \$1 AND id_cajero = \$2\s+FOR UPDATE/.test(t)) {
      if (bloqueo) {
        let release;
        const siguiente = new Promise(resolve=>{release=resolve;});
        const anterior=proximoBloqueo;
        proximoBloqueo=siguiente;
        await anterior;
        client.liberar=release;
      }
      return { rows: turno && turno.id_turno===params[0] && turno.id_cajero===params[1] ? [ {...turno} ] : [] };
    }
    if (/FROM public\.turnos_caja t\s+LEFT JOIN LATERAL/.test(t)) {
      if (!turno) return {rows:[]};
      if (/WHERE t\.id_cajero = \$1 AND t\.estado = 'abierto'/.test(t)) {
        return {rows:turno.id_cajero===params[0] && turno.estado==='abierto' ? [resumen()] : []};
      }
      if (/WHERE t\.id_cajero = \$1 AND t\.estado = 'cerrado'/.test(t)) {
        return {rows:turno.id_cajero===params[0] && turno.estado==='cerrado' ? [resumen()] : []};
      }
      if (/WHERE t\.id_turno = \$1 AND t\.id_cajero = \$2/.test(t)) {
        return {rows:turno.id_turno===params[0] && turno.id_cajero===params[1] ? [resumen()] : []};
      }
    }
    if (/UPDATE public\.turnos_caja/.test(t)) {
      if (error) throw Object.assign(new Error('Error simulado de PostgreSQL'), {code:error});
      assert.ok(client?.tx, 'UPDATE requiere transaccion');
      assert.equal(turno?.estado, 'abierto');
      assert.equal(params[0],51);
      assert.equal(params[1],8);
      turno.estado='cerrado'; turno.cerrado_at='2026-10-20T17:00:00Z';
      turno.efectivo_esperado=params[2]; turno.efectivo_contado=params[3];
      turno.diferencia=(Number(params[3])-Number(params[2])).toFixed(2);
      turno.observaciones_cierre=params[4];
      turno.cierre_idempotency_key=params[5];
      turno.cierre_idempotency_hash=params[6];
      historico.push({...turno});
      return {rows:[{...turno}]};
    }
    throw new Error('SQL no simulado: '+t);
  };
  const pool={
    async query(sql, params) { return ejecutarConsulta(sql,params); },
    async connect() {const client={tx:false,liberar:null,async query(sql,params){return ejecutarConsulta(sql,params,this);},release(){}};return client;},
  };
  const modulo={exports:{}};
  vm.runInNewContext(codigo, {
    module:modulo,exports:modulo.exports,
    console:{error(){}},
    require(nombre){
      if(nombre==='../config/db')return {cajeroPool:pool};
      if(nombre==='node:crypto')return require('node:crypto');
      throw Error('Require inesperado: '+nombre);
    },
  },{filename:'turnos-cierre.controller.js'});
  return {
    turno, consultas, historico, api:modulo.exports,
    async get(usuario=cajero) {const res=respuesta(); await modulo.exports.consultarArqueoActual({personal:usuario},res);return res;},
    async list(usuario=cajero) {const res=respuesta(); await modulo.exports.listarTurnosCerrados({personal:usuario},res);return res;},
    async post(datos=body(), usuario=cajero, id='51') {
      const res=respuesta(); await modulo.exports.cerrarTurnoCaja({personal:usuario,params:{id},body:datos},res);return res;
    },
  };
}

test('rutas del arqueo y cierre requieren JWT y rol cajero', () => {
  assert.match(rutas,/router\.use\(autenticarPersonal, autorizarRoles\('cajero', 'administrador'\)\)/);
  assert.match(rutas,/router\.get\('\/turnos\/actual\/arqueo', autorizarRoles\('cajero'\)/);
  assert.match(rutas,/router\.get\('\/turnos\/cierres', autorizarRoles\('cajero'\)/);
  assert.match(rutas,/router\.post\('\/turnos\/:id\/cerrar', autorizarRoles\('cajero'\)/);
});
test('el arqueo calcula el saldo con operaciones independientes', async () => {
  const s=simular();const r=await s.get();
  assert.equal(r.codigo,200);assert.equal(r.datos.hay_turno,true);
  assert.equal(r.datos.data.efectivo_teorico,'195.25');
  assert.equal(r.datos.data.total_cobrado,'130.25');
  assert.equal(r.datos.data.ventas_yape,'50.00');
  assert.equal(r.datos.data.ventas_efectivo,'80.25');
});
test('no hay arqueo abierto si el cajero no tiene turno', async () => {
  const s=simular({estado:'cerrado'});const r=await s.get();
  assert.equal(r.datos.hay_turno,false);assert.equal(r.datos.data,null);
});
test('listar cierres se restringe al cajero autenticado', async () => {
  const s=simular({estado:'cerrado'});const r=await s.list();
  assert.equal(r.datos.data.length,1);assert.equal(r.datos.data[0].id_cajero,8);
  assert.ok(s.consultas.some(x=>/WHERE t\.id_cajero = \$1 AND t\.estado = 'cerrado'/.test(x.sql)));
});
test('rechaza rol administrador y mesero sin acceder a PostgreSQL', async () => {
  for (const usuario of [null,{rol:'administrador',id_trabajador:8},{rol:'mesero',id_trabajador:8},{rol:'cajero',id_trabajador:'abc'}]) {
    const s=simular();assert.equal((await s.post(body(),usuario)).codigo,403);
    assert.equal((await s.get(usuario)).codigo,403);
    assert.equal((await s.list(usuario)).codigo,403);
    assert.equal(s.consultas.length,0);
  }
});
test('valida importes negativos, exponenciales y mas de dos decimales', async () => {
  for(const valor of ['','-1','3e4','10.001','2,50',null,undefined,true,{},NaN,Infinity,'10000000000']) {
    const s=simular(); const r=await s.post(body({efectivo_contado:valor}));
    assert.equal(r.codigo,400,`Importe ${String(valor)}`);assert.equal(s.consultas.length,0);
  }
});
test('acepta efectivo 0 y normaliza centimos sin floats', async () => {
  const s=simular(); const r=await s.post(body({efectivo_contado:'0'}));
  assert.equal(r.codigo,201);assert.equal(s.turno.efectivo_contado,'0.00');
  assert.equal(s.turno.diferencia,'-195.25');
});
test('valida clave, observaciones, id y solicitud de tipo incorrecto', async () => {
  for(const cambio of [{idempotency_key:''},{idempotency_key:'123'}, {idempotency_key:' abcdefghijklmnop'},
    {idempotency_key:'aa\nbbbbbbbbbbbbbbbbb'}, {observaciones_cierre:'x'.repeat(501)}, {observaciones_cierre:123}]) {
    const s=simular();assert.equal((await s.post(body(cambio))).codigo,400);
  }
  for(const id of ['0','-1','1e2','abc','9007199254740999']) {
    const s=simular();assert.equal((await s.post(body(),cajero,id)).codigo,400);
  }
  const s=simular();assert.equal((await s.post(null)).codigo,400);
});
test('no permite cerrar un turno ajeno o inexistente', async () => {
  const s=simular({idCajero:7});const r=await s.post();assert.equal(r.codigo,404);
  assert.equal(s.historico.length,0);
});
test('cierra y guarda esperado, contado, diferencia exacta y notas de cierre', async () => {
  const s=simular(); const r=await s.post();
  assert.equal(r.codigo,201);assert.equal(r.datos.repetido,false);
  assert.equal(s.turno.estado,'cerrado');assert.equal(s.turno.efectivo_esperado,'195.25');
  assert.equal(s.turno.efectivo_contado,'190.25');assert.equal(s.turno.diferencia,'-5.00');
  assert.equal(s.turno.observaciones,'Fondo inicial comprobado');
  assert.equal(s.turno.observaciones_cierre,'Arqueo con faltante');
  assert.match(s.turno.cierre_idempotency_hash,/^[0-9a-f]{64}$/);
  assert.equal(s.historico.length,1);
});
test('permite cierre exacto y sobrante, incluyendo centimos', async () => {
  for(const [importe,diferencia] of [['195.25','0.00'],['195.35','0.10']]) {
    const s=simular(); const r=await s.post(body({efectivo_contado:importe}));
    assert.equal(r.codigo,201);assert.equal(r.datos.data.diferencia,diferencia);
  }
});
test('reintento identico recupera el mismo cierre sin nuevo UPDATE', async () => {
  const s=simular();const primero=await s.post(); const segundo=await s.post();
  assert.equal(primero.codigo,201);assert.equal(segundo.codigo,200);
  assert.equal(segundo.datos.repetido,true);assert.equal(s.historico.length,1);
  assert.equal(s.consultas.filter(x=>/^UPDATE public\.turnos_caja/.test(x.sql)).length,1);
});
test('otra clave o monto sobre turno ya cerrado responde 409', async () => {
  const s=simular();await s.post();
  assert.equal((await s.post(body({efectivo_contado:'200.00'}))).codigo,409);
  assert.equal((await s.post(body({idempotency_key:'otra-clave-segura-123456789'}))).codigo,409);
  assert.equal(s.historico.length,1);
});
test('dos cierres simultaneos con igual clave crean uno solo', async () => {
  const s=simular({bloqueo:true});
  const [a,b]=await Promise.all([s.post(),s.post()]);
  assert.deepEqual([a.codigo,b.codigo].sort(),[200,201]);
  assert.equal(s.historico.length,1);
});
test('ante un error de base de datos ejecuta ROLLBACK y libera la conexion', async () => {
  const s=simular({error:'23505'});const r=await s.post();
  assert.equal(r.codigo,409);assert.equal(s.turno.estado,'abierto');
  assert.ok(s.consultas.some(x=>x.sql==='ROLLBACK'));
  assert.equal(s.historico.length,0);
});
test('reporta migracion pendiente como 503 sin revelar error SQL', async () => {
  const s=simular({error:'42703'});const r=await s.post();
  assert.equal(r.codigo,503);assert.equal(r.datos.code,'MIGRACION_CIERRE_PENDIENTE');
});
test('pago y movimiento bloquean turno; cierre hace FOR UPDATE y no duplica ventas', () => {
  assert.match(pago,/SELECT id_turno FROM public\.turnos_caja[\s\S]*?FOR SHARE/);
  assert.match(movimiento,/FROM public\.turnos_caja\s+WHERE id_turno = \$1 AND id_cajero = \$2\s+FOR UPDATE/);
  assert.match(codigo,/FROM public\.turnos_caja\s+WHERE id_turno = \$1 AND id_cajero = \$2\s+FOR UPDATE/);
  assert.match(codigo,/LEFT JOIN LATERAL/);
  assert.match(codigo,/LEFT JOIN public\.v_resumen_movimientos_caja/);
  assert.match(codigo,/pg\.estado_pago = 'pagado'/);
  assert.match(codigo,/diferencia = \$4::numeric - \$3::numeric/);
});
test('el corte antiguo solo liquida pagos historicos sin turno', () => {
  assert.match(pago,/AND pg\.id_turno IS NULL/);
});
