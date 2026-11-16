'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const archivo = path.join(__dirname, '../src/controllers/subcuentas.controller.js');
const fuente = fs.readFileSync(archivo, 'utf8');
const rutas = fs.readFileSync(path.join(__dirname, '../src/routes/cajero.routes.js'), 'utf8');

function res() { return { statusCode:200, payload:null, status(n){this.statusCode=n;return this;}, json(o){this.payload=o;return this;} }; }
function banco({ cuenta=true, estado='pendiente', cerrado=false, fallo=null }={}) {
  const cuentas = cuenta ? [{ id_cuenta:7,id_grupo_mesa:12, estado }] : [];
  let personas = [{id_subcuenta:101,id_cuenta:7,nombre:'Ana',estado:'pendiente',creada_at:'2026-10-20T00:00:00Z'}];
  let repartos = [];
  let pagos = [];
  let seq = 101;
  const consultas=[];
  const producto = [{id_detalle_producto:11,id_pedido:21,subtotal:'35.00',cantidad:1,nombre:'Pizza',estado_pedido:'entregado'},
     {id_detalle_producto:12,id_pedido:22,subtotal:'25.00',cantidad:1,nombre:'Arroz',estado_pedido:'entregado'}];
  function client() {
    let snapshot=null;
    return {
      async query(sql, param=[]) {
        const s=sql.trim(); consultas.push({s,param});
        if (fallo && (fallo==='migration') && s.includes('public.subcuentas')) throw Object.assign(new Error('relation missing'),{code:'42P01'});
        if(s==='BEGIN') { snapshot={personas:structuredClone(personas),repartos:structuredClone(repartos)};return {rows:[]}; }
        if(s==='ROLLBACK') { if(snapshot) {personas=snapshot.personas;repartos=snapshot.repartos;} snapshot=null;return {rows:[]};}
        if(s==='COMMIT') {snapshot=null;return {rows:[]};}
        if (/SELECT id_cuenta, id_grupo_mesa, estado FROM public.cuentas/.test(s)) return {rows:cuentas.filter(c=>c.id_cuenta===param[0])};
        if (/SELECT id_subcuenta, id_cuenta, nombre, estado FROM public.subcuentas/.test(s)) return {rows:personas.filter(p=>p.id_cuenta===param[0] && p.id_subcuenta===param[1])};
        if (/SELECT EXISTS\(SELECT 1 FROM public.pagos/.test(s)) return {rows:[{tiene_pagos: pagos.some(p=>p.id_subcuenta===param[0])}]};
        if (/INSERT INTO public.subcuentas/.test(s)) {
          const [id_cuenta,nombre,id_creada_por]=param;
          if(personas.some(p=>p.nombre.trim().toLowerCase()===nombre.trim().toLowerCase() && p.estado!=='anulada')) throw Object.assign(new Error('duplicate'),{code:'23505'});
          const p={id_subcuenta:++seq,id_cuenta,nombre,estado:'pendiente',id_creada_por}; personas.push(p);return {rows:[p]};
        }
        if (/INSERT INTO public.subcuenta_detalle/.test(s)) {
          const [id_subcuenta,id_detalle_producto,monto_asignado,cantidad_asignada]=param;
          if(!producto.some(d=>d.id_detalle_producto===id_detalle_producto))throw Object.assign(new Error('wrong product'),{code:'23514'});
          if(repartos.some(d=>d.id_subcuenta===id_subcuenta && d.id_detalle_producto===id_detalle_producto)) throw Object.assign(new Error('duplicate'),{code:'23505'});
          const totalAsignado=repartos.filter(d=>d.id_detalle_producto===id_detalle_producto).reduce((sum,d)=>sum+Number(d.monto_asignado),0);
          if(totalAsignado+Number(monto_asignado)>Number(producto.find(d=>d.id_detalle_producto===id_detalle_producto).subtotal)) throw Object.assign(new Error('overbook'),{code:'23514'});
          const d={id_subcuenta_detalle:repartos.length+1,id_subcuenta,id_detalle_producto,monto_asignado,cantidad_asignada};repartos.push(d);return {rows:[d]};
        }
        if (/DELETE FROM public.subcuenta_detalle/.test(s)) {
          if (pagos.some(p=>p.id_subcuenta===param[1])) throw Object.assign(new Error('paid'),{code:'23514'});
          const i=repartos.findIndex(d=>d.id_subcuenta_detalle===param[0] && d.id_subcuenta===param[1]);
          if(i<0)return {rows:[]};const [d]=repartos.splice(i,1);return {rows:[d]};
        }
        if (/FROM public.v_subcuentas_resumen/.test(s)) {
          return {rows:personas.filter(p=>p.id_cuenta===param[0]).map(p=>({ ...p,total_asignado:repartos.filter(d=>d.id_subcuenta===p.id_subcuenta).reduce((sum,d)=>sum+Number(d.monto_asignado),0).toFixed(2),total_pagado:'0.00',total_pendiente:'0.00'}))};
        }
        if (/FROM public.subcuenta_detalle sd\s+JOIN public.subcuentas/.test(s))return {rows:repartos.filter(d=>personas.some(p=>p.id_subcuenta===d.id_subcuenta && p.id_cuenta===param[0])).map(d=>({...d,monto_pagado:'0.00',monto_pendiente:d.monto_asignado}))};
        if (/FROM public.v_distribucion_cuenta/.test(s)) return {rows:producto.map(d=>({...d,disponible_para_asignar:(Number(d.subtotal)-repartos.filter(x=>x.id_detalle_producto===d.id_detalle_producto).reduce((sum,x)=>sum+Number(x.monto_asignado),0)).toFixed(2)}))};
        throw new Error(`SQL inesperado: ${s.slice(0,110)}`);
      }, release() {},
    };
  }
  const inst=client();
  const pool={query:(...args)=>inst.query(...args),connect:async()=>client()};
  const module={exports:{}};
  vm.runInNewContext(fuente,{module,exports:module.exports,require:n=>{
    if(n==='../config/db')return {cajeroPool:pool};throw Error(n);
  }, console:{error(){}},}, {filename:archivo});
  async function call(metodo,{id='7',idSubcuenta='101',idAsignacion='1',body={},personal={rol:'cajero',id_trabajador:8}}={}) {
    const r=res();await module.exports[metodo]({params:{id,idSubcuenta,idAsignacion},body,personal},r);return r;
  }
  return {call, personas:()=>personas,repartos:()=>repartos,pagos,consultas};
}

test('18: nuevas rutas exigen rol de cajero, incluido el pago de subcuentas',()=>{
  for (const endpoint of ['/cuentas/:id/subcuentas','/cuentas/:id/subcuentas/:idSubcuenta/detalles','/cuentas/:id/subcuentas/:idSubcuenta/pagos']) {
    assert.ok(rutas.includes(endpoint));
  }
  assert.match(rutas,/router\.post\('\/cuentas\/:id\/subcuentas\/:idSubcuenta\/pagos',\s*autorizarRoles\('cajero'\),\s*cajeroController\.registrarPago\)/);
});

test('18: crear participante con nombre limpio y actor real de sesion',async()=>{
  const s=banco(); const r=await s.call('crearSubcuenta',{body:{nombre:'  Luis  ',id_creada_por:999}});
  assert.equal(r.statusCode,201); assert.equal(r.payload.data.nombre,'Luis');
  assert.equal(s.personas()[1].id_creada_por,8);
  assert.deepEqual(s.consultas.filter(c=>/^(BEGIN|COMMIT)$/.test(c.s)).map(c=>c.s),['BEGIN','COMMIT']);
});
test('18: crear participante no acepta metodo sin rol cajero',async()=>{
  const s=banco();const r=await s.call('crearSubcuenta',{body:{nombre:'Luis'},personal:{rol:'administrador',id_trabajador:9}});
  assert.equal(r.statusCode,403);assert.equal(s.consultas.length,0);
});
test('18: rechaza nombre vacio, demasiado largo o con control',async()=>{
  for (const nombre of ['', ' '.repeat(3),'a'.repeat(81),'Ana\nLuis',null]) {
    const s=banco();const r=await s.call('crearSubcuenta',{body:{nombre}});assert.equal(r.statusCode,400, String(nombre));
  }
});
test('18: rechaza cuerpo no JSON y cuenta invalida',async()=>{
  assert.equal((await banco().call('crearSubcuenta',{body:null})).statusCode,400);
  assert.equal((await banco().call('crearSubcuenta',{id:'1 OR 1=1',body:{nombre:'L'}})).statusCode,400);
});
test('18: cuenta inexistente o pagada no permite crear',async()=>{
  assert.equal((await banco({cuenta:false}).call('crearSubcuenta',{body:{nombre:'Luis'}})).statusCode,404);
  assert.equal((await banco({estado:'pagada'}).call('crearSubcuenta',{body:{nombre:'Luis'}})).statusCode,409);
});
test('18: nombre duplicado sin importar mayusculas es 409',async()=>{
  const r=await banco().call('crearSubcuenta',{body:{nombre:' ana '}});assert.equal(r.statusCode,409);
});
test('18: agrega importe monetario exacto y cantidad fraccionaria',async()=>{
  const s=banco();const r=await s.call('asignarProducto',{body:{id_detalle_producto:11,monto_asignado:'17.50',cantidad_asignada:'0.500'}});
  assert.equal(r.statusCode,201);assert.equal(r.payload.data.monto_asignado,'17.50');
  assert.equal(r.payload.data.cantidad_asignada,'0.500');
  assert.ok(s.consultas.some(c=>/FOR UPDATE/.test(c.s)));
});
test('18: no acepta importes negativos, cero o fracciones subcentavo',async()=>{
  for(const valor of [0,'-1','0.00','0.001','abc',null,{},'123456789012.34']) {
    const s=banco();const r=await s.call('asignarProducto',{body:{id_detalle_producto:11,monto_asignado:valor}});
    assert.equal(r.statusCode,400,String(valor));
  }
});
test('18: no acepta cantidades invalidas',async()=>{
  for(const valor of ['-1','0','0.000','0.0001',{},NaN]) {
    const r=await banco().call('asignarProducto',{body:{id_detalle_producto:11,monto_asignado:'1.00',cantidad_asignada:valor}});
    assert.equal(r.statusCode,400,String(valor));
  }
});
test('18: no permite reservar un producto de otra cuenta',async()=>{
  const r=await banco().call('asignarProducto',{body:{id_detalle_producto:999,monto_asignado:'1.00'}});
  assert.equal(r.statusCode,409);
});
test('18: no permite repartir mas dinero del subtotal',async()=>{
  const s=banco();await s.call('asignarProducto',{body:{id_detalle_producto:11,monto_asignado:'30.00'}});
  const r=await s.call('asignarProducto',{idSubcuenta:'101',body:{id_detalle_producto:12,monto_asignado:'25.00'}});
  assert.equal(r.statusCode,201);
  const l=await s.call('crearSubcuenta',{body:{nombre:'Luis'}});
  const overflow=await s.call('asignarProducto',{idSubcuenta:String(l.payload.data.id_subcuenta),body:{id_detalle_producto:11,monto_asignado:'10.00'}});
  assert.equal(overflow.statusCode,409);
});
test('18: una misma persona no asigna dos veces el mismo detalle',async()=>{
  const s=banco();await s.call('asignarProducto',{body:{id_detalle_producto:11,monto_asignado:'15.00'}});
  assert.equal((await s.call('asignarProducto',{body:{id_detalle_producto:11,monto_asignado:'1.00'}})).statusCode,409);
});
test('18: persona de otra cuenta no puede recibir asignaciones',async()=>{
  const r=await banco().call('asignarProducto',{idSubcuenta:'999',body:{id_detalle_producto:11,monto_asignado:'1.00'}});
  assert.equal(r.statusCode,404);
});
test('18: bloquea la adicion de asignaciones despues del primer pago',async()=>{
  const s=banco();s.pagos.push({id_subcuenta:101});
  const r=await s.call('asignarProducto',{body:{id_detalle_producto:11,monto_asignado:'1.00'}});
  assert.equal(r.statusCode,409);
});
test('18: eliminar una asignacion sin cobros es posible',async()=>{
  const s=banco();await s.call('asignarProducto',{body:{id_detalle_producto:11,monto_asignado:'10.00'}});
  const r=await s.call('eliminarAsignacion');assert.equal(r.statusCode,200);assert.equal(s.repartos().length,0);
});
test('18: no permite eliminar asignaciones con pagos',async()=>{
  const s=banco();await s.call('asignarProducto',{body:{id_detalle_producto:11,monto_asignado:'10.00'}});
  s.pagos.push({id_subcuenta:101});assert.equal((await s.call('eliminarAsignacion')).statusCode,409);
});
test('18: la lectura responde productos y participantes con importes libres',async()=>{
  const s=banco();await s.call('asignarProducto',{body:{id_detalle_producto:11,monto_asignado:'15.00'}});
  const r=await s.call('listarSubcuentas');assert.equal(r.statusCode,200);
  assert.equal(r.payload.data.cuenta.id_cuenta,7);
  assert.equal(r.payload.data.subcuentas[0].detalles[0].monto_asignado,'15.00');
  assert.equal(r.payload.data.productos[0].disponible_para_asignar,'20.00');
});
test('18: consultar cuenta inexistente devuelve 404',async()=>{
  const r=await banco({cuenta:false}).call('listarSubcuentas');assert.equal(r.statusCode,404);
});
test('18: si falta migracion SQL responde 503, no publica error de BD',async()=>{
  const r=await banco({fallo:'migration'}).call('crearSubcuenta',{body:{nombre:'Luis'}});
  assert.equal(r.statusCode,503);assert.equal(r.payload.code,'MIGRACION_SUBCUENTAS_PENDIENTE');
});
