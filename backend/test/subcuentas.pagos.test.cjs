'use strict';
// Commit 18: usa el controlador REAL con PostgreSQL y eventos simulados.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const archivo=path.resolve(__dirname, '../src/controllers/cajero.controller.js');
const fuente=fs.readFileSync(archivo,'utf8');
const CLAVE='menugo-subcuenta-2026-pago01';
const centavos=x=>Math.round(Number(x)*100);
const moneda=x=>(x/100).toFixed(2);

function banco({turnoAbierto=true,cocina='entregado',falloComprobante=false,preparacion=false}={}) {
  const consultas=[];const eventos=[];
  const items=[{id:11,subtotal:3500,tipo:'mesa',estado:preparacion?'preparando':cocina},
              {id:12,subtotal:2500,tipo:'mesa',estado:cocina}];
  const personas=new Map([[101,'pendiente'],[102,'pendiente']]);
  const asignaciones=[{persona:101,item:11,monto:1500}, {persona:101,item:12,monto:2500}, {persona:102,item:11,monto:2000}];
  const pagos=[]; const detalles=[]; let siguientePago=70, estadoCuenta='pendiente'; let cerrarGrupo=false;
  const byId=(id)=>items.find(p=>p.id===id);
  const pagadoPersona=(persona,item, tx=null) => detalles.filter(d=>d.id_detalle_producto===item && pagos.find(p=>p.id_pago===d.id_pago)?.id_subcuenta===persona).reduce((acc,d)=>acc+centavos(d.monto),0) + (tx?.pago?.id_subcuenta===persona ? tx.detalles.filter(d=>d.id_detalle_producto===item).reduce((acc,d)=>acc+centavos(d.monto),0) : 0);
  function client() {
    let tx=null;
    const query=async (sql,params=[])=>{
      const s=String(sql).trim();consultas.push({s,params});
      if (/^(ALTER TABLE|CREATE TABLE|CREATE INDEX)/i.test(s))return {rows:[]};
      if(s==='BEGIN') {tx={pago:null,detalles:[],marcarPersona:null,marcarCuenta:false,comprobante:false,grupo:false};return {rows:[]};}
      if(s==='ROLLBACK'){tx=null;return {rows:[]};}
      if(s==='COMMIT') {
        if(tx.pago)pagos.push(tx.pago);
        detalles.push(...tx.detalles);
        if(tx.marcarPersona)personas.set(tx.marcarPersona,'pagada');
        if(tx.marcarCuenta)estadoCuenta='pagada';
        if(tx.grupo)cerrarGrupo=true;
        tx=null;return {rows:[]};
      }
      if(/pg_advisory_xact_lock/.test(s))return {rows:[{}]};
      if (/WHERE pg.idempotency_key = \$1/.test(s)) {
        const p=pagos.find(p=>p.idempotency_key===params[0]);
        return {rows:p?[{...p,id_grupo_mesa:12,comprobante_tipo:'boleta',comprobante_dni:'12345678'}]:[]};
      }
      if (/SELECT id_turno FROM public\.turnos_caja/.test(s)) return {rows:turnoAbierto?[{id_turno:51}]:[]};
      if (/SELECT id_cuenta, id_grupo_mesa, estado, total FROM cuentas/.test(s))return {rows:[{id_cuenta:7,id_grupo_mesa:12,estado:estadoCuenta,total:'60.00'}]};
      if(/SELECT dp\.id_detalle_producto/.test(s) && /AS pendiente/.test(s) && /p\.tipo_pedido/.test(s)) {
        // Libre = subtotal menos asignaciones y pagos ordinarios.
        return {rows:items.map(p=>({id_detalle_producto:p.id,subtotal:moneda(p.subtotal),tipo_pedido:p.tipo,estado_pedido:p.estado,pendiente:moneda(p.subtotal-asignaciones.filter(d=>d.item===p.id).reduce((a,d)=>a+d.monto,0))})).filter(d=>centavos(d.pendiente)>0)};
      }
      if (/SELECT id_subcuenta, estado FROM public\.subcuentas/.test(s)) {
        const p=personas.get(params[1]);return {rows:p?[{id_subcuenta:params[1],estado:p}]:[]};
      }
      if (/FROM public\.subcuenta_detalle sd\s+JOIN public\.detalle_producto/.test(s)) {
        const [id,grupo]=params;assert.equal(grupo,12);
        return {rows:asignaciones.filter(a=>a.persona===id).map(a=>({id_detalle_producto:a.item,monto_asignado:moneda(a.monto),tipo_pedido:byId(a.item).tipo,estado_pedido:byId(a.item).estado,pendiente:moneda(a.monto-pagadoPersona(id,a.item,tx))}))};
      }
      if(/^INSERT INTO pagos/.test(s)) {
        const p={id_pago:++siguientePago,id_cuenta:params[0],metodo_pago:params[1],monto:params[2],pagado_por:params[3],estado_pago:'pagado',id_cajero:params[8],monto_recibido:params[9],vuelto:params[10],idempotency_key:params[11],idempotency_hash:params[12],id_turno:params[13],id_subcuenta:params[14]};
        if(p.id_subcuenta) {
          const total=asignaciones.filter(a=>a.persona===p.id_subcuenta).reduce((a,b)=>a+b.monto,0);
          const ya=pagos.filter(x=>x.id_subcuenta===p.id_subcuenta).reduce((a,b)=>a+centavos(b.monto),0);
          if(centavos(p.monto)+ya>total) throw Object.assign(new Error('overspent'),{code:'23514'});
        }
        tx.pago=p;return {rows:[p]};
      }
      if(/^INSERT INTO detalle_pago/.test(s)) {
        const [id_pago,id_detalle_producto,monto]=params;let original=tx.pago;
        if(original.id_subcuenta) {
          const total=asignaciones.find(a=>a.persona===original.id_subcuenta && a.item===id_detalle_producto)?.monto||0;
          if(!total || pagadoPersona(original.id_subcuenta,id_detalle_producto,tx)+centavos(monto)>total)throw Object.assign(new Error('detail overspent'),{code:'23514'});
        }
        tx.detalles.push({id_pago,id_detalle_producto,monto});return {rows:[]};
      }
      if(/^INSERT INTO comprobantes/.test(s)) {
        if(falloComprobante)throw new Error('simulated invoice error');
        tx.comprobante=true;return {rows:[]};
      }
      if(/FROM public\.v_subcuentas_resumen WHERE id_subcuenta = \$1/.test(s)) {
        const id=params[0],asignado=asignaciones.filter(a=>a.persona===id).reduce((a,b)=>a+b.monto,0);
        const cobrado=pagos.filter(x=>x.id_subcuenta===id).reduce((a,b)=>a+centavos(b.monto),0)+(tx?.pago?.id_subcuenta===id?centavos(tx.pago.monto):0);
        return {rows:[{total_asignado:moneda(asignado),total_pendiente:moneda(asignado-cobrado)}]};
      }
      if(/^UPDATE public\.subcuentas SET estado = 'pagada'/.test(s)) {tx.marcarPersona=params[0];return {rows:[]};}
      if(/SELECT COALESCE\(SUM\(pendiente\), 0\) AS saldo/.test(s)) {
        const pagado=pagos.reduce((a,p)=>a+centavos(p.monto),0)+(tx?.pago?centavos(tx.pago.monto):0);
        return {rows:[{saldo:moneda(6000-pagado)}]};
      }
      if(/^UPDATE cuentas SET estado = 'pagada'/.test(s)) {tx.marcarCuenta=true;return {rows:[]};}
      if(/^UPDATE solicitudes_cuenta SET estado = 'atendida'/.test(s))return {rows:[]};
      if(/hay_pedidos_pendientes/.test(s))return {rows:[{hay_pedidos_pendientes:false,hay_cuentas_pendientes:false}]};
      if(/^UPDATE grupos_mesa SET estado = 'cerrado'/.test(s)) {tx.grupo=true;return {rows:[]};}
      throw new Error(`SQL inesperado: ${s.slice(0,130)}`);
    };
    return {query,release(){}};
  }
  const module={exports:{}};
  vm.runInNewContext(fuente, {module,exports:module.exports,
    require(n){
      if(n==='../config/db')return {cajeroPool:{connect:async()=>client()}};
      if(n==='node:crypto')return require('node:crypto');
      if(n==='./pedidos.controller')return {mapMetodoPago:x=>x};
      if(n==='../utils/eventEmitter')return {emitPagoRegistrado:x=>eventos.push({tipo:'pago',x}),emitCuentaActualizada:x=>eventos.push({tipo:'cuenta',x})};
      throw Error(n);
    },console:{error(){}},
  },{filename:archivo});
  async function cobrar({persona=101,seleccion=null,clave=CLAVE,body={},idCuenta=7}={}) {
    const r={statusCode:200,payload:null,status(c){this.statusCode=c;return this;},json(p){this.payload=p;return this;}};
    const params={id:String(idCuenta)};if(persona!==null)params.idSubcuenta=String(persona);
    const data={metodo_pago:'Efectivo',monto_recibido:'50.00',tipo_comprobante:'boleta',dni:'12345678',pagado_por:'Ana',idempotency_key:clave,...body};
    if(seleccion!==null)data.detalles=seleccion.map(id_detalle_producto=>({id_detalle_producto, monto:'0.01'}));
    await module.exports.registrarPago({params,body:data,personal:{id_trabajador:8,nombre:'Caja test',rol:'cajero'}},r);
    return r;
  }
  return {cobrar,pagos,detalles,personas,consultas,eventos,estadoCuenta:()=>estadoCuenta,grupoCerrado:()=>cerrarGrupo,setTurno:(v)=>{turnoAbierto=v;}};
}

test('18: Ana paga una parte de pizza + arroz, importe exclusivamente desde BD',async()=>{
  const s=banco();const r=await s.cobrar({body:{monto:'0.01',vuelto:'999.99'}});
  assert.equal(r.statusCode,201,JSON.stringify(r.payload));assert.equal(r.payload.data.monto,'40.00');
  assert.equal(r.payload.data.monto_recibido,'50.00');assert.equal(r.payload.data.vuelto,'10.00');
  assert.equal(s.detalles.length,2);assert.deepEqual(s.detalles.map(d=>d.monto),['15.00','25.00']);
  assert.equal(s.pagos[0].id_subcuenta,101);assert.equal(s.pagos[0].id_turno,51);
  assert.equal(s.personas.get(101),'pagada');assert.equal(s.estadoCuenta(),'pendiente');
  assert.equal(r.payload.data.saldo_pendiente,20);
});
test('18: Luis paga el resto y la cuenta original se marca pagada',async()=>{
  const s=banco();await s.cobrar();const segundo=await s.cobrar({persona:102,clave:'menugo-subcuenta-2026-pago02',body:{monto_recibido:'20.00',pagado_por:'Luis'}});
  assert.equal(segundo.statusCode,201);assert.equal(segundo.payload.data.monto,'20.00');
  assert.equal(s.personas.get(102),'pagada');assert.equal(s.estadoCuenta(),'pagada');assert.equal(s.grupoCerrado(),true);
});
test('18: la persona puede pagar por un item y luego otro',async()=>{
  const s=banco();const r=await s.cobrar({seleccion:[11]});assert.equal(r.statusCode,201);
  assert.equal(r.payload.data.monto,'15.00');assert.equal(s.personas.get(101),'pendiente');
  const segundo=await s.cobrar({seleccion:[12],clave:'menugo-subcuenta-2026-pago02'});assert.equal(segundo.statusCode,201);
  assert.equal(segundo.payload.data.monto,'25.00');assert.equal(s.personas.get(101),'pagada');
});
test('18: no se cobran productos sin asignar a esa persona',async()=>{
  const s=banco();const r=await s.cobrar({persona:102,seleccion:[12]});assert.equal(r.statusCode,400);assert.equal(s.pagos.length,0);
});
test('18: producto asignado pero aun en preparacion no se puede cobrar',async()=>{
  const s=banco({preparacion:true});const r=await s.cobrar({persona:101,seleccion:[11]});
  assert.equal(r.statusCode,400);assert.equal(s.pagos.length,0);
});
test('18: sin turno abierto no admite un nuevo pago por persona',async()=>{
  const s=banco({turnoAbierto:false});const r=await s.cobrar();assert.equal(r.statusCode,409);
  assert.equal(r.payload.code,'TURNO_CAJA_REQUERIDO');assert.equal(s.pagos.length,0);
});
test('18: idempotencia devuelve mismo pago sin nuevos registros ni eventos',async()=>{
  const s=banco();const r=await s.cobrar();const r2=await s.cobrar();
  assert.equal(r.statusCode,201);assert.equal(r2.statusCode,200);assert.equal(r2.payload.repetido,true);
  assert.equal(r2.payload.data.id_pago,r.payload.data.id_pago);
  assert.equal(s.pagos.length,1);assert.equal(s.eventos.length,2);
});
test('18: reintento recupera cobro despues de cerrar turno',async()=>{
  const s=banco();await s.cobrar();s.setTurno(false);
  assert.equal((await s.cobrar()).statusCode,200);assert.equal(s.pagos.length,1);
});
test('18: no permite reutilizar la clave de una persona para otra',async()=>{
  const s=banco();await s.cobrar();const r=await s.cobrar({persona:102});
  assert.equal(r.statusCode,409);assert.equal(r.payload.code,'IDEMPOTENCY_CONFLICT');assert.equal(s.pagos.length,1);
});
test('18: no permite pagos ordinarios sobre todos los productos reservados',async()=>{
  const s=banco();const r=await s.cobrar({persona:null});assert.equal(r.statusCode,400);
  assert.equal(s.pagos.length,0);
});
test('18: no paga subcuenta desconocida y tampoco pagada',async()=>{
  const s=banco();assert.equal((await s.cobrar({persona:999})).statusCode,404);
  await s.cobrar();assert.equal((await s.cobrar({clave:'menugo-subcuenta-2026-pago03'})).statusCode,409);
});
test('18: pago digital exige referencia',async()=>{
  const s=banco();const r=await s.cobrar({body:{metodo_pago:'Yape',monto_recibido:undefined}});
  assert.equal(r.statusCode,400);assert.equal(s.pagos.length,0);
});
test('18: efectivo insuficiente es rechazado aun con monto cliente alto',async()=>{
  const s=banco();const r=await s.cobrar({body:{monto:'100.00',monto_recibido:'20.00'}});
  assert.equal(r.statusCode,400);assert.equal(s.pagos.length,0);
});
test('18: se deshace toda la transaccion si falla el comprobante',async()=>{
  const s=banco({falloComprobante:true});const r=await s.cobrar();
  assert.equal(r.statusCode,500);assert.equal(s.pagos.length,0);assert.equal(s.detalles.length,0);
});
test('18: evita enviar id_subcuenta desde el body cuando es un pago ordinario',async()=>{
  const s=banco();const r=await s.cobrar({persona:null,body:{id_subcuenta:101}});
  assert.equal(r.statusCode,400);assert.equal(s.pagos.length,0);
});
test('18: valida id de subcuenta y no acepta textos SQL',async()=>{
  const s=banco();const r=await s.cobrar({persona:'101 OR 1=1'});assert.equal(r.statusCode,400);
  assert.equal(s.pagos.length,0);
});
test('18: se bloquea cuenta antes de consultar asignaciones y guarda mismo id turno',async()=>{
  const s=banco();await s.cobrar();const idxCuenta=s.consultas.findIndex(q=>/SELECT id_cuenta, id_grupo_mesa, estado, total FROM cuentas/.test(q.s));
  const idxPersona=s.consultas.findIndex(q=>/SELECT id_subcuenta, estado FROM public\.subcuentas/.test(q.s));
  assert.ok(idxCuenta>=0 && idxPersona>idxCuenta);
  assert.equal(s.pagos[0].id_turno,51);
});
