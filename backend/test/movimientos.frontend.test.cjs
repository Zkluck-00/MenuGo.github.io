'use strict';
// Commit 15 - Interfaz de movimientos sin navegador externo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const codigo = fs.readFileSync(path.resolve(__dirname,'../../Frontend/js/movimientos-caja.js'),'utf8');
const html = fs.readFileSync(path.resolve(__dirname,'../../Frontend/Cajero/movimientos_caja.html'),'utf8');
const cajero = fs.readFileSync(path.resolve(__dirname,'../../Frontend/Cajero/cajero.html'),'utf8');
const corte = fs.readFileSync(path.resolve(__dirname,'../../Frontend/Cajero/corte_caja.html'),'utf8');
const resumen = { id_turno: 51, estado:'abierto', fondo_inicial:'100.00',
  ventas_efectivo:'40.00', total_ingresos:'10.00', total_retiros:'15.00',
  efectivo_teorico:'135.00', cantidad_movimientos:2 };

function simularPantalla({ hayTurno = true, post = null, almacen = null } = {}) {
  const elems = new Map(); const solicitudes = []; const escuchas = new Map();
  const almacenamiento = almacen || new Map();
  function el(id) {
    if (!elems.has(id)) {
      const clases = new Set(['hidden']);
      const item = { value:'', textContent:'', className:'', disabled:false, _html:'',
        classList:{
          add(c) { clases.add(c); }, remove(c) { clases.delete(c); },
          toggle(c, v) { if (v===true) clases.add(c); else if (v===false) clases.delete(c); else { if(clases.has(c)) clases.delete(c); else clases.add(c); } },
          contains(c) { return clases.has(c); },
        },
        addEventListener(tipo, callback) { escuchas.set(`${id}/${tipo}`,callback); },
        reset() { el('monto-movimiento-caja').value=''; el('motivo-movimiento-caja').value=''; el('referencia-movimiento-caja').value=''; },
      };
      Object.defineProperty(item,'innerHTML',{ get(){return this._html;}, set(v){
        this._html=v;
        if(id==='categoria-movimiento-caja') { this.value = v.match(/<option value="([^"]+)"/)?.[1] || ''; }
      }});
      elems.set(id,item);
    }
    return elems.get(id);
  }
  const sessionStorage = {
    setItem(k,v){almacenamiento.set(k,v);},
    getItem(k){return almacenamiento.get(k)||null;},
    removeItem(k){almacenamiento.delete(k);},
  };
  const contexto=vm.createContext({
    window:{MENUGO_API:'https://api.example.com/api',crypto:{randomUUID:()=> '9633f751-6892-4ac2-8722-d113c2a6d27f'},confirm:()=>true, location:{replace(){}},},
    document:{getElementById:el,addEventListener(){}},
    localStorage:{removeItem(){}},sessionStorage,
    headersAutenticadosPersonal(rol){assert.equal(rol,'cajero');return {Authorization:'Bearer token', 'Content-Type':'application/json'};},
    fetch:async (url, options) => {
      solicitudes.push({url,options});
      assert.match(url,/\/cajero\/turnos\/actual\/movimientos$/);
      if(options?.method === 'POST') {
        if(post) return post(url,options,solicitudes);
        return {status:201,ok:true,async json(){return {ok:true,repetido:false,data:{id_movimiento:1}};}};
      }
      return {status:200,ok:true,async json(){return {ok:true,hay_turno:hayTurno,
        data:hayTurno?resumen:null,movimientos:[]};}};
    },
    console:{log(){},error(){}},
    Uint8Array,Date,Number,String,JSON,Array,Set,Map,
  });
  vm.runInContext(codigo,contexto,{filename:'movimientos-caja.js'});
  async function inicializar() { contexto.configurarMovimientosCajaUI(); await new Promise(resolve => setImmediate(resolve)); await contexto.cargarMovimientosCaja(); }
  function llenarForm() {
    el('tipo-movimiento-caja').value='ingreso';
    el('categoria-movimiento-caja').value='reposicion';
    el('monto-movimiento-caja').value='25.50';
    el('motivo-movimiento-caja').value='Fondo adicional';
    el('referencia-movimiento-caja').value='REC-09';
  }
  return { contexto, el, solicitudes, escuchas, inicializar, llenarForm, almacenamiento };
}

test('pantalla completa carga sesion real y JavaScript del modulo', () => {
  assert.match(html,/\.\.\/js\/personal-auth\.js/);
  assert.match(html,/\.\.\/js\/movimientos-caja\.js/);
  assert.match(html,/form-movimiento-caja/);
  assert.match(html,/lista-movimientos-caja/);
});

test('links a movimientos aparecen en Caja y en Corte', () => {
  assert.match(cajero,/href="movimientos_caja\.html"/);
  assert.match(corte,/href="movimientos_caja\.html"/);
});

test('pantalla muestra resumen con fondo, efectivo, ingresos y retiros del servidor', async () => {
  const s=simularPantalla(); await s.inicializar();
  assert.equal(s.el('mov-fondo').textContent,'S/ 100.00');
  assert.equal(s.el('mov-ventas').textContent,'S/ 40.00');
  assert.equal(s.el('mov-ingresos').textContent,'S/ 10.00');
  assert.equal(s.el('mov-retiros').textContent,'S/ 15.00');
  assert.equal(s.el('mov-teorico').textContent,'S/ 135.00');
  assert.equal(s.el('campos-movimiento-caja').disabled,false);
});

test('sin turno bloquea el formulario y ofrece acceso a apertura', async () => {
  const s=simularPantalla({hayTurno:false}); await s.inicializar();
  assert.equal(s.el('campos-movimiento-caja').disabled,true);
  assert.equal(s.el('aviso-sin-turno').classList.contains('hidden'),false);
});

test('al seleccionar retiro se cargan solo categorias de salida', async () => {
  const s=simularPantalla(); await s.inicializar();
  s.el('tipo-movimiento-caja').value='retiro';
  s.escuchas.get('tipo-movimiento-caja/change')();
  assert.match(s.el('categoria-movimiento-caja').innerHTML,/gasto/);
  assert.match(s.el('categoria-movimiento-caja').innerHTML,/retiro_banco/);
  assert.doesNotMatch(s.el('categoria-movimiento-caja').innerHTML,/reposicion/);
});

test('envia JWT, monto y turno del servidor con clave segura', async () => {
  const s=simularPantalla(); await s.inicializar(); s.llenarForm();
  await s.contexto.registrarMovimientoCajaUI({preventDefault(){}});
  const r=s.solicitudes.find(x=>x.options?.method==='POST');
  assert.ok(r);
  const payload=JSON.parse(r.options.body);
  assert.equal(payload.id_turno,51);
  assert.equal(payload.tipo,'ingreso');
  assert.equal(payload.monto,'25.50');
  assert.equal(payload.idempotency_key.length,36);
  assert.equal(r.options.headers.Authorization,'Bearer token');
});

test('validacion UI impide enviar montos malformados o motivo corto', async () => {
  for (const [monto,motivo] of [['-1','Fondo extra'],['1e3','Fondo extra'],['1.234','Fondo extra'],['20','abc']]) {
    const s=simularPantalla(); await s.inicializar(); s.llenarForm();
    s.el('monto-movimiento-caja').value=monto;
    s.el('motivo-movimiento-caja').value=motivo;
    await s.contexto.registrarMovimientoCajaUI({preventDefault(){}});
    assert.equal(s.solicitudes.filter(r=>r.options?.method==='POST').length,0);
  }
});

test('historial escapa contenido del cliente y no interpreta HTML inseguro', async () => {
  const s=simularPantalla(); await s.inicializar();
  s.contexto.mostrarMovimientosCaja([{id_movimiento:1,tipo:'ingreso',categoria:'otro',monto:'1.00',
    motivo:'<img src=x onerror=alert(1)>',referencia:'<script>alert(1)</script>',registrado_at:'2026-10-20T00:00:00Z'}]);
  const texto=s.el('lista-movimientos-caja').innerHTML;
  assert.match(texto,/&lt;img/);
  assert.match(texto,/&lt;script&gt;/);
  assert.doesNotMatch(texto,/<img /);
});

test('un error de red conserva la misma solicitud para reintentar', async () => {
  let fallos=0;
  const s=simularPantalla({post:async () => {
    if (!fallos++) throw new Error('Falla temporal');
    return {status:200,ok:true,async json(){return {ok:true,repetido:true};}};
  }});
  await s.inicializar();s.llenarForm();
  await s.contexto.registrarMovimientoCajaUI({preventDefault(){}});
  assert.equal(s.el('aviso-reintento-movimiento').classList.contains('hidden'),false);
  assert.equal(s.el('campos-movimiento-caja').disabled,true);
  await s.contexto.enviarMovimientoCaja(JSON.parse(s.almacenamiento.get('menugo_movimiento_pendiente_v1')));
  const solicitudes=s.solicitudes.filter(x=>x.options?.method==='POST');
  assert.equal(solicitudes.length,2);
  assert.equal(solicitudes[0].options.body,solicitudes[1].options.body);
  assert.equal(s.almacenamiento.size,0);
});

test('al recargar pestaña se restaura solicitud pendiente y su clave', async () => {
  const almacen=new Map();
  const payload={id_turno:51,tipo:'ingreso',categoria:'otro',monto:'25.00',
    motivo:'Ajuste caja manual',referencia:null,idempotency_key:'b5c17aa9-4dbb-4670-a5cb-5d49f2ce151c'};
  almacen.set('menugo_movimiento_pendiente_v1',JSON.stringify(payload));
  const s=simularPantalla({almacen}); await s.inicializar();
  assert.equal(s.el('campos-movimiento-caja').disabled,true);
  assert.equal(s.el('aviso-reintento-movimiento').classList.contains('hidden'),false);
  await s.contexto.enviarMovimientoCaja(payload);
  assert.equal(s.almacenamiento.size,0);
});

test('respuesta definitiva 409 habilita el formulario nuevamente y muestra el error', async () => {
  const s=simularPantalla({post:async()=>({status:409,ok:false,async json(){return {ok:false,code:'EFECTIVO_INSUFICIENTE',message:'Sin fondos suficientes'};}})});
  await s.inicializar(); s.llenarForm();
  await s.contexto.registrarMovimientoCajaUI({preventDefault(){}});
  assert.equal(s.almacenamiento.size,0);
  assert.equal(s.el('campos-movimiento-caja').disabled,false);
  assert.match(s.el('mensaje-movimientos-caja').textContent,/Sin fondos suficientes/);
});

test('muestra historial vacio si no hay movimientos', async () => {
  const s=simularPantalla(); await s.inicializar();
  assert.match(s.el('lista-movimientos-caja').innerHTML,/Todavia no hay movimientos manuales/);
});
