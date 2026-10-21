'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const js=fs.readFileSync(path.resolve(__dirname,'../../Frontend/js/arqueo-caja.js'),'utf8');
const html=fs.readFileSync(path.resolve(__dirname,'../../Frontend/Cajero/corte_caja.html'),'utf8');
const turno={
  id_turno:51, estado:'abierto', fondo_inicial:'100.00', ventas_efectivo:'80.25',
  ventas_yape:'40.00', ventas_plin:'10.00', ventas_tarjeta_credito:'20.00', ventas_tarjeta_debito:'5.00',
  total_cobrado:'155.25', total_ingresos:'20.00', total_retiros:'5.00',
  cantidad_pagos:4, cantidad_movimientos:2, efectivo_teorico:'195.25',
};
const cerrado={...turno,estado:'cerrado',efectivo_contado:'190.25',efectivo_esperado:'195.25',
  diferencia:'-5.00', cerrado_at:'2026-10-20T18:00:00Z',abierto_at:'2026-10-20T12:00:00Z',
  observaciones_cierre:'Nota del turno'};
function crearUI({turnoInicial=turno,confirmacion=true,falloRed=false,postDemorado=false, guardado={}}={}) {
  const elementos=new Map();
  const eventos=new Map();
  const solicitudes=[];
  const almacen=new Map(Object.entries(guardado));
  let actual=turnoInicial;
  let historial=turnoInicial?.estado==='cerrado'?[cerrado]:[];
  let postCount=0;
  let resolverPost;
  let fallo=falloRed;
  const eventosEnvio=[];
  const elem=(id)=>{
    if(!elementos.has(id)){
      const clases=new Set(['hidden']);
      elementos.set(id,{
        textContent:'',innerHTML:'',value:'',disabled:false,className:'',
        classList:{
          contains:(v)=>clases.has(v),add:(v)=>clases.add(v),remove:(v)=>clases.delete(v),
          toggle:(v,b)=>{if(b===undefined){if(clases.has(v))clases.delete(v);else clases.add(v);}else if(b)clases.add(v);else clases.delete(v);},
        },
        addEventListener(tipo,fn){eventos.set(id+':'+tipo,fn);},
      });
    }
    return elementos.get(id);
  };
  elem('efectivo-contado-cierre').value='190.25';
  elem('observaciones-cierre-turno').value='Arqueo final';
  const window={MENUGO_API:'http://localhost:4000/api',crypto:{randomUUID:()=> '2ad04d83-7467-4fb5-9adb-ce1010247777'},confirm:()=>confirmacion,location:{replace(){}}};
  const ctx=vm.createContext({
    window, URL, Number, Date, JSON, sessionStorage:{
      getItem:k=>almacen.get(k)||null,setItem:(k,v)=>almacen.set(k,v),removeItem:k=>almacen.delete(k),
    },
    localStorage:{removeItem(){}},
    document:{getElementById:elem,addEventListener(){}},
    headersAutenticadosPersonal:(rol)=>{assert.equal(rol,'cajero');return {Authorization:'Bearer test','Content-Type':'application/json'};},
    fetch:async (url, options={})=>{
      const ruta=url.replace('http://localhost:4000/api','');
      solicitudes.push({ruta,options});
      if(ruta==='/cajero/turnos/actual/arqueo')return {ok:true,status:200,json:async()=>({ok:true,data:actual})};
      if(ruta==='/cajero/turnos/cierres')return {ok:true,status:200,json:async()=>({ok:true,data:historial})};
      if(ruta==='/cajero/turnos/51/cerrar'){
        postCount++;
        eventosEnvio.push(JSON.parse(options.body));
        if(postDemorado)await new Promise(resolve=>{resolverPost=resolve;});
        if(fallo){fallo=false;throw new Error('Conexión interrumpida');}
        actual=null;historial=[cerrado];
        return {ok:true,status:postCount===1?201:200,json:async()=>({ok:true,data:cerrado,repetido:postCount!==1})};
      }
      throw new Error('Ruta inesperada '+ruta);
    },
  });
  vm.runInContext(js,ctx,{filename:'arqueo-caja.js'});
  return {ctx,elem,eventos,almacen,solicitudes,eventosEnvio,
    setTurno(v){actual=v;}, resolverPost:()=>resolverPost?.(), posts:()=>postCount};
}

test('HTML incluye arqueo, historial, accesibilidad y mantiene el corte histórico',()=>{
  for(const id of ['seccion-resumen-arqueo','efectivo-contado-cierre','diferencia-estimada-cierre',
    'historial-turnos-cerrados','aviso-reintento-cierre','resumen-corte','historial-cortes','observaciones-corte']){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(html,/src="\.\.\/js\/arqueo-caja\.js"/);
  assert.match(html,/src="\.\.\/js\/corte-caja\.js"/);
  assert.match(html,/aria-live="polite"/);
});
test('sin turno abierto impide cerrar y ofrece historial',async()=>{
  const ui=crearUI({turnoInicial:null}); await ui.ctx.cargarArqueoCaja();
  assert.equal(ui.elem('seccion-resumen-arqueo').classList.contains('hidden'),true);
  assert.equal(ui.elem('campos-cierre-turno').disabled,true);
  assert.equal(ui.elem('aviso-sin-turno-arqueo').classList.contains('hidden'),false);
});
test('vista previa distingue efectivo de pagos digitales y muestra faltante',async()=>{
  const ui=crearUI();await ui.ctx.cargarArqueoCaja();
  assert.equal(ui.elem('arqueo-esperado').textContent,'S/ 195.25');
  assert.equal(ui.elem('arqueo-ventas-efectivo').textContent,'S/ 80.25');
  assert.equal(ui.elem('arqueo-yape').textContent,'S/ 40.00');
  assert.equal(ui.elem('arqueo-tarjetas').textContent,'S/ 25.00');
  assert.match(ui.elem('diferencia-estimada-cierre').textContent,/S\/ 5\.00 \(faltante\)/);
  assert.equal(ui.elem('campos-cierre-turno').disabled,false);
});
test('diferencia estimada exacta y positiva con centimos',async()=>{
  const ui=crearUI();await ui.ctx.cargarArqueoCaja();
  ui.elem('efectivo-contado-cierre').value='195.25';ui.ctx.mostrarDiferenciaEstimada();
  assert.match(ui.elem('diferencia-estimada-cierre').textContent,/S\/ 0\.00 \(cuadra\)/);
  ui.elem('efectivo-contado-cierre').value='195.35';ui.ctx.mostrarDiferenciaEstimada();
  assert.match(ui.elem('diferencia-estimada-cierre').textContent,/S\/ 0\.10 \(sobrante\)/);
});
test('revisa valores invalidos antes de crear la solicitud',async()=>{
  const ui=crearUI();await ui.ctx.cargarArqueoCaja();
  for(const val of ['-1','1e2','10.001','1,20','']){
    ui.elem('efectivo-contado-cierre').value=val;
    await ui.ctx.cerrarTurnoCajaUI({preventDefault(){}});
  }
  assert.equal(ui.posts(),0);
});
test('muestra confirmacion antes de cerrar y respeta cancelacion',async()=>{
  const ui=crearUI({confirmacion:false});await ui.ctx.cargarArqueoCaja();
  await ui.ctx.cerrarTurnoCajaUI({preventDefault(){}});
  assert.equal(ui.posts(),0);
});
test('POST envia clave idempotente y registra cierre de turno',async()=>{
  const ui=crearUI();await ui.ctx.cargarArqueoCaja();
  await ui.ctx.cerrarTurnoCajaUI({preventDefault(){}});
  assert.equal(ui.posts(),1);
  assert.equal(ui.eventosEnvio[0].efectivo_contado,'190.25');
  assert.equal(ui.eventosEnvio[0].observaciones_cierre,'Arqueo final');
  assert.match(ui.eventosEnvio[0].idempotency_key,/^[\w-]{16,100}$/);
  assert.equal(ui.elem('campos-cierre-turno').disabled,true);
  assert.equal(ui.elem('historial-turnos-cerrados').innerHTML.includes('Turno #51'),true);
  assert.equal(ui.almacen.size,0);
});
test('fallo de red conserva el payload y el reintento usa la MISMA clave',async()=>{
  const ui=crearUI({falloRed:true});await ui.ctx.cargarArqueoCaja();
  await ui.ctx.cerrarTurnoCajaUI({preventDefault(){}});
  assert.equal(ui.posts(),1);
  assert.equal(ui.elem('campos-cierre-turno').disabled,true);
  assert.equal(ui.almacen.size,1);
  assert.match(ui.elem('mensaje-arqueo-caja').textContent,/No se pudo confirmar/);
  await ui.ctx.enviarCierreCaja(JSON.parse(ui.almacen.get('menugo_cierre_turno_pendiente_v1')));
  assert.equal(ui.posts(),2);
  assert.equal(ui.eventosEnvio[0].idempotency_key,ui.eventosEnvio[1].idempotency_key);
  assert.equal(ui.almacen.size,0);
});
test('se restaura un cierre pendiente al recargar la pagina',async()=>{
  const pendiente={id_turno:51,efectivo_contado:'150.00',observaciones_cierre:null,
    idempotency_key:'2ad04d83-7467-4fb5-9adb-ce1010247777'};
  const ui=crearUI({guardado:{'menugo_cierre_turno_pendiente_v1':JSON.stringify(pendiente)}});
  ui.ctx.restaurarPendienteCierre();
  await ui.ctx.cargarArqueoCaja();
  assert.equal(ui.elem('campos-cierre-turno').disabled,true);
  assert.equal(ui.elem('aviso-reintento-cierre').classList.contains('hidden'),false);
  assert.match(ui.elem('descripcion-reintento-cierre').textContent,/Turno #51/);
});
test('dos clics mientras el cierre sigue en curso no envian otro POST',async()=>{
  const ui=crearUI({postDemorado:true});await ui.ctx.cargarArqueoCaja();
  const uno=ui.ctx.cerrarTurnoCajaUI({preventDefault(){}});
  await ui.ctx.cerrarTurnoCajaUI({preventDefault(){}});
  assert.equal(ui.posts(),1);
  ui.resolverPost();await uno;
  assert.equal(ui.posts(),1);
});
test('observaciones no generan HTML ejecutable en historial',()=>{
  const ui=crearUI();ui.ctx.mostrarHistorialArqueo([{...cerrado,observaciones_cierre:'<img src=x onerror=alert(1)>'}]);
  const texto=ui.elem('historial-turnos-cerrados').innerHTML;
  assert.ok(!texto.includes('<img'));
  assert.ok(texto.includes('&lt;img'));
});
test('sin crypto segura no permite generar un nuevo cierre',async()=>{
  const ui=crearUI();await ui.ctx.cargarArqueoCaja();ui.ctx.window.crypto={};
  await ui.ctx.cerrarTurnoCajaUI({preventDefault(){}});
  assert.equal(ui.posts(),0);
  assert.match(ui.elem('mensaje-arqueo-caja').textContent,/HTTPS o localhost/);
});
