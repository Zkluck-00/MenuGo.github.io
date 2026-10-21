'use strict';
// Commit 15 - Pruebas de movimientos manuales con cliente PostgreSQL simulado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const controlador = fs.readFileSync(path.resolve(__dirname, '../src/controllers/movimientos-caja.controller.js'), 'utf8');
const rutas = fs.readFileSync(path.resolve(__dirname, '../src/routes/cajero.routes.js'), 'utf8');
const CLAVE = 'b9ab1e21-6c10-4db2-bd48-5819b61857a3';
const personal = { id_trabajador: 8, rol: 'cajero' };

function respuesta() {
  return { codigo: 200, datos: null, status(c) { this.codigo = c; return this; }, json(d) { this.datos = d; return this; } };
}
function datosMovimiento(overrides = {}) {
  return { id_turno: 51, tipo: 'ingreso', categoria: 'reposicion', monto: '25.50',
    motivo: 'Fondo adicional para cambio', referencia: 'ACT-25', idempotency_key: CLAVE, ...overrides };
}
function simular({ existe = true, estado = 'abierto', efectivo = '100.00', errorInsert = null } = {}) {
  const consultas = [];
  const movimientos = [];
  const locks = new Map();
  const turno = existe ? { id_turno: 51, id_cajero: 8, estado, fondo_inicial: efectivo } : null;
  let nextId = 1;
  const pool = {
    async query(sql, params = []) {
      const t = String(sql); consultas.push({ t, params });
      if (/LEFT JOIN public\.v_resumen_movimientos_caja/.test(t)) {
        if (!turno || turno.estado !== 'abierto' || params[0] !== turno.id_cajero) return { rows: [] };
        const ins = movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
        const outs = movimientos.filter(m => m.tipo === 'retiro').reduce((s, m) => s + Number(m.monto), 0);
        return { rows: [{ ...turno, ventas_efectivo: '0.00', total_ingresos: String(ins),
          total_retiros: String(outs), cantidad_movimientos: movimientos.length,
          efectivo_teorico: String(Number(efectivo) + ins - outs) }] };
      }
      if (/FROM public\.movimientos_caja\s+WHERE id_turno/.test(t)) {
        return { rows: movimientos.filter(m => m.id_turno === params[0]).slice().reverse() };
      }
      throw new Error('Consulta inesperada pool.query: ' + t);
    },
    async connect() {
      let liberarBloqueo;
      return {
        async query(sql, params = []) {
          const t = String(sql); consultas.push({ t, params });
          if (t === 'BEGIN') return { rows: [] };
          if (t === 'COMMIT' || t === 'ROLLBACK') {
            liberarBloqueo?.(); liberarBloqueo = null;
            return { rows: [] };
          }
          if (/pg_advisory_xact_lock/.test(t)) {
            const clave = params[0];
            const anterior = locks.get(clave) || Promise.resolve();
            let resolver;
            const nueva = new Promise(resolve => { resolver = resolve; });
            locks.set(clave, anterior.then(() => nueva));
            await anterior;
            liberarBloqueo = resolver;
            return { rows: [] };
          }
          if (/WHERE idempotency_key = \$1/.test(t)) {
            const m = movimientos.find(m => m.idempotency_key === params[0]);
            return { rows: m ? [m] : [] };
          }
          if (/FROM public\.turnos_caja\s+WHERE id_turno = \$1 AND id_cajero = \$2/.test(t)) {
            return { rows: turno && params[0] === turno.id_turno && params[1] === turno.id_cajero ? [turno] : [] };
          }
          if (/SELECT saldo\.disponible/.test(t)) {
            const ins = movimientos.filter(m => m.tipo === 'ingreso').reduce((s,m) => s + Number(m.monto), 0);
            const outs = movimientos.filter(m => m.tipo === 'retiro').reduce((s,m) => s + Number(m.monto), 0);
            const disponible = Number(efectivo) + ins - outs;
            return { rows: [{ disponible: String(disponible), suficiente: disponible >= Number(params[1]) }] };
          }
          if (/INSERT INTO public\.movimientos_caja/.test(t)) {
            if (errorInsert) throw errorInsert;
            if (!turno || turno.estado !== 'abierto') throw Object.assign(new Error('Turno cerrado'), {code:'23514'});
            const [id_turno,id_registrado_por,tipo,categoria,monto,motivo,referencia,idempotency_key,idempotency_hash] = params;
            const m = { id_movimiento: nextId++, id_turno, id_registrado_por, tipo, categoria,
              monto, motivo, referencia, registrado_at: '2026-10-20T15:00:00Z', idempotency_key, idempotency_hash };
            movimientos.push(m);
            return { rows: [m] };
          }
          throw new Error('Consulta inesperada client.query: ' + t);
        },
        release() {},
      };
    },
  };
  const modulo = { exports: {} };
  vm.runInNewContext(controlador, {
    module: modulo, exports: modulo.exports,
    console: { error() {} },
    require(nombre) {
      if (nombre === '../config/db') return { cajeroPool: pool };
      if (nombre === 'node:crypto') return require('node:crypto');
      throw new Error('Require no esperado: ' + nombre);
    },
  }, { filename:'movimientos-caja.controller.js' });
  return {
    api: modulo.exports, consultas, movimientos, turno,
    async post(body=datosMovimiento(), usuario=personal) {
      const res = respuesta();
      await modulo.exports.registrarMovimientoCaja({ body, personal:usuario }, res);
      return res;
    },
    async get(usuario=personal) {
      const res = respuesta();
      await modulo.exports.listarMovimientosCaja({ personal:usuario }, res);
      return res;
    },
  };
}

test('rutas exigen JWT y rol cajero y separan movimientos de pagos', () => {
  assert.match(rutas, /router\.use\(autenticarPersonal, autorizarRoles\('cajero', 'administrador'\)\)/);
  assert.match(rutas, /router\.get\('\/turnos\/actual\/movimientos', autorizarRoles\('cajero'\), movimientosCajaController\.listarMovimientosCaja\)/);
  assert.match(rutas, /router\.post\('\/turnos\/actual\/movimientos', autorizarRoles\('cajero'\), movimientosCajaController\.registrarMovimientoCaja\)/);
});

test('registra ingreso con cajero del JWT, monto canonico, huella sha256 e id de turno', async () => {
  const s = simular(); const res = await s.post();
  assert.equal(res.codigo, 201);
  assert.equal(s.movimientos[0].id_registrado_por, 8);
  assert.equal(s.movimientos[0].id_turno, 51);
  assert.equal(s.movimientos[0].monto, '25.50');
  assert.match(s.movimientos[0].idempotency_hash, /^[0-9a-f]{64}$/);
  assert.equal(s.movimientos.length, 1);
});

test('admite reposicion y ajuste para ingreso y gasto, banco, ajuste u otro para retiro', async () => {
  for (const [tipo, categoria] of [
    ['ingreso','reposicion'],['ingreso','ajuste'],['ingreso','otro'],
    ['retiro','gasto'],['retiro','retiro_banco'],['retiro','ajuste'],['retiro','otro']
  ]) {
    const s = simular(); const r = await s.post(datosMovimiento({ tipo, categoria }));
    assert.equal(r.codigo, 201, `${tipo}/${categoria}`);
  }
});

test('rechaza categorias incompatibles o desconocidas', async () => {
  for (const d of [ {tipo:'ingreso',categoria:'gasto'}, {tipo:'retiro',categoria:'reposicion'},
    {tipo:'cobro',categoria:'otro'}, {tipo:'',categoria:'otro'}, {tipo:'retiro',categoria:'inyeccion'} ]) {
    const s = simular(); const r = await s.post(datosMovimiento(d));
    assert.equal(r.codigo,400); assert.equal(s.consultas.length,0);
  }
});

test('rechaza montos negativos, nulos, exponenciales, mas de dos decimales, Infinity y excesivos', async () => {
  for (const monto of [0, -1, '0.00', '1e3', '2.001', '1,20', null, undefined, true, {}, NaN, Infinity, '10000000000.00']) {
    const s = simular(); const r = await s.post(datosMovimiento({ monto }));
    assert.equal(r.codigo, 400, `Debia rechazar ${String(monto)}`);
    assert.equal(s.consultas.length, 0);
  }
});

test('admite centimos decimales exactos: S/ 0.10, 0.20 y 0.30', async () => {
  for (const monto of ['0.10','0.20','0.30']) {
    const s = simular(); const r = await s.post(datosMovimiento({ monto }));
    assert.equal(r.codigo, 201); assert.equal(s.movimientos[0].monto, monto);
  }
});

test('valida longitud del motivo y referencia y recorta espacios', async () => {
  for (const cambio of [ { motivo:'  x  ' }, { motivo:'a'.repeat(301) },
    {motivo:123}, {referencia:'x'.repeat(101)}, {referencia:123} ]) {
    const s = simular(); assert.equal((await s.post(datosMovimiento(cambio))).codigo, 400);
  }
  const s = simular(); assert.equal((await s.post(datosMovimiento({motivo:'  Fondo contado  ', referencia:'  REC-4  '}))).codigo,201);
  assert.equal(s.movimientos[0].motivo,'Fondo contado');
  assert.equal(s.movimientos[0].referencia,'REC-4');
});

test('rechaza claves ausentes, cortas, con espacios o controles', async () => {
  for (const clave of ['',null,'abc','a'.repeat(101),' clave-muy-larga-11111','cadena-con-control\n123456']) {
    const s = simular(); assert.equal((await s.post(datosMovimiento({idempotency_key:clave}))).codigo,400);
  }
});

test('rechaza datos invalidos de turno', async () => {
  for (const id of [0, -2, 'abc', null, true, [51], '1e2', '9007199254740999']) {
    const s = simular(); assert.equal((await s.post(datosMovimiento({id_turno:id}))).codigo,400);
  }
});

test('rechaza usuarios sin rol cajero antes de consultar la BD', async () => {
  for (const usuario of [null,{rol:'administrador',id_administrador:1}, {rol:'mesero',id_trabajador:8}, {rol:'cajero',id_trabajador:'no'}]) {
    const s = simular(); const r = await s.post(datosMovimiento(), usuario);
    assert.equal(r.codigo,403); assert.equal(s.consultas.length,0);
  }
});

test('no crea movimientos en turnos cerrados', async () => {
  const s = simular({estado:'cerrado'});
  const r = await s.post(); assert.equal(r.codigo,409);
  assert.equal(r.datos.code,'TURNO_CAJA_REQUERIDO'); assert.equal(s.movimientos.length,0);
});

test('no crea movimientos para otro turno ni para cajero diferente', async () => {
  const s = simular(); const r = await s.post(datosMovimiento({id_turno:500}));
  assert.equal(r.codigo,409); assert.equal(s.movimientos.length,0);
  assert.equal((await s.post(datosMovimiento(),{rol:'cajero',id_trabajador:9})).codigo,409);
});

test('retiro igual al efectivo disponible se permite usando comparacion NUMERIC de PostgreSQL', async () => {
  const s = simular({ efectivo:'0.30' });
  const r = await s.post(datosMovimiento({tipo:'retiro',categoria:'gasto',monto:'0.30'}));
  assert.equal(r.codigo,201);
  const consulta = s.consultas.find(q => /SELECT saldo\.disponible/.test(q.t));
  assert.match(consulta.t,/\$2::numeric/);
  assert.equal(consulta.params[1], '0.30');
});

test('retiro superior al efectivo se rechaza sin INSERT', async () => {
  const s = simular({efectivo:'20.00'});
  const r = await s.post(datosMovimiento({tipo:'retiro',categoria:'gasto',monto:'20.01'}));
  assert.equal(r.codigo,409); assert.equal(r.datos.code,'EFECTIVO_INSUFICIENTE');
  assert.equal(s.movimientos.length,0);
});

test('ingresos aumentan el efectivo disponible para retiros posteriores', async () => {
  const s=simular({efectivo:'10.00'});
  assert.equal((await s.post(datosMovimiento({monto:'20.00'}))).codigo,201);
  const r=await s.post(datosMovimiento({ tipo:'retiro',categoria:'gasto',monto:'30.00',idempotency_key:'d1af5b07-5151-4d21-a620-8c1d17cd0088' }));
  assert.equal(r.codigo,201); assert.equal(s.movimientos.length,2);
});

test('reintento identico devuelve 200 y mismo movimiento sin insertar otro', async () => {
  const s=simular(); const a=await s.post(); const b=await s.post();
  assert.equal(a.codigo,201); assert.equal(b.codigo,200);
  assert.equal(b.datos.repetido,true); assert.equal(b.datos.data.id_movimiento,a.datos.data.id_movimiento);
  assert.equal(s.movimientos.length,1);
});

test('la misma clave con payload diferente retorna 409 sin alterar el registro', async () => {
  const s=simular(); await s.post();
  const r=await s.post(datosMovimiento({monto:'100.00'}));
  assert.equal(r.codigo,409); assert.equal(r.datos.code,'IDEMPOTENCY_CONFLICT');
  assert.equal(s.movimientos.length,1);
});

test('reintento de movimiento ya guardado funciona despues del cierre', async () => {
  const s=simular(); await s.post(); s.turno.estado='cerrado';
  const r=await s.post(); assert.equal(r.codigo,200); assert.equal(s.movimientos.length,1);
});

test('reintentos concurrentes de la misma clave solo insertan una fila', async () => {
  const s=simular();
  const [a,b]=await Promise.all([s.post(),s.post()]);
  assert.deepEqual([a.codigo,b.codigo].sort(),[200,201]);
  assert.equal(s.movimientos.length,1);
});

test('consulta devuelve totales preagrupados e historial solo del turno propio', async () => {
  const s=simular(); await s.post();
  const r=await s.get(); assert.equal(r.codigo,200);
  assert.equal(r.datos.data.cantidad_movimientos,1);
  assert.equal(r.datos.movimientos.length,1);
  assert.match(s.consultas.find(q=>/LEFT JOIN public\.v_resumen/.test(q.t)).t,/pg\.id_turno = t\.id_turno/);
});

test('sin turno activo GET devuelve data null sin historial', async () => {
  const s=simular({existe:false}); const r=await s.get();
  assert.equal(r.codigo,200); assert.equal(r.datos.hay_turno,false);
  assert.equal(r.datos.data,null); assert.equal(r.datos.movimientos.length,0);
});

test('GET de otro cajero no muestra el historial del turno ajeno', async () => {
  const s=simular(); await s.post();
  const r=await s.get({rol:'cajero',id_trabajador:9});
  assert.equal(r.datos.hay_turno,false);
  assert.equal(s.movimientos.length,1);
});

test('errores de migracion no filtran informacion interna', async () => {
  const s=simular({errorInsert:Object.assign(new Error('consulta confidencial'),{code:'42P01'})});
  const r=await s.post(); assert.equal(r.codigo,503);
  assert.equal(r.datos.code,'MIGRACION_MOVIMIENTOS_PENDIENTE');
  assert.doesNotMatch(JSON.stringify(r.datos),/consulta confidencial/);
});

test('un error durante INSERT ejecuta ROLLBACK y devuelve mensaje generico', async () => {
  const s=simular({errorInsert:new Error('detalles internos')});
  const r=await s.post(); assert.equal(r.codigo,500);
  assert.ok(s.consultas.some(q=>q.t==='ROLLBACK'));
  assert.equal(s.movimientos.length,0);
  assert.doesNotMatch(JSON.stringify(r.datos),/detalles internos/);
});

test('SQL de pagos se consulta exclusivamente para efectivo y no duplica ventas', () => {
  assert.match(controlador,/pg\.estado_pago = 'pagado' AND pg\.metodo_pago = 'efectivo'/);
  assert.doesNotMatch(controlador,/INSERT INTO\s+(?:public\.)?pagos/i);
});
