'use strict';
// Regresion MenuGo: calendario, periodos y consulta paginada de comprobantes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const leer = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function obtenerHandlerServidor(opciones = {}) {
  const codigo = leer('backend/src/controllers/cajero.controller.js');
  const inicio = codigo.indexOf('async function listarComprobantes(req, res) {');
  const final = codigo.indexOf('\nasync function atenderSolicitudCuenta(req, res) {', inicio);
  assert.ok(inicio >= 0 && final > inicio, 'No se encontro la consulta de comprobantes');
  const consultas = [];
  const contexto = {
    asegurarEsquemaCaja: async () => {},
    cajeroPool: { async query(sql, params) {
      consultas.push({ sql, params });
      if (/TO_CHAR\(co\.fecha_emision::date/.test(sql)) return {rows:[{fecha:'2026-11-15',cantidad:2,total:'50.00'}]};
      if (/COUNT\(\*\)::int AS total,/.test(sql)) return {rows:[{total:2,monto_total:'50.00'}]};
      if (/SELECT co\.\*/.test(sql)) return {rows:[{id_comprobante:9,id_pago:34,monto:'20.00'}]};
      throw new Error('Consulta no preparada');
    } },
    console: {error() {}},
  };
  const fn = vm.runInNewContext(`${codigo.slice(inicio,final)}\nlistarComprobantes`, contexto);
  const respuesta = () => ({code:200,body:null,status(n) {this.code=n;return this;},json(x) {this.body=x;return this;}});
  return {fn,consultas,respuesta};
}

test('nueva facturacion: el backend pagina y filtra fechas y tipo con parametros SQL', async () => {
  const env = obtenerHandlerServidor();
  const res = env.respuesta();
  await env.fn({query:{tipo:'boleta',desde:'2026-08-15',hasta:'2026-11-15',pagina:'2',limite:'24'}},res);
  assert.equal(res.body.ok,true);
  assert.equal(res.body.total,2);
  assert.equal(res.body.monto_total,'50.00');
  assert.equal(res.body.pagina,2);
  assert.equal(env.consultas.length,2);
  assert.match(env.consultas[0].sql,/COUNT\(\*\)::int AS total/);
  assert.match(env.consultas[1].sql,/LIMIT \$4 OFFSET \$5/);
  assert.match(env.consultas[1].sql,/co\.fecha_emision >= \$2::date/);
  assert.match(env.consultas[1].sql,/co\.fecha_emision < \(\$3::date \+ INTERVAL '1 day'\)/);
  assert.deepEqual(Array.from(env.consultas[1].params),['boleta','2026-08-15','2026-11-15',24,24]);
});

test('nueva facturacion: el calendario agrupa por dia y conserva el total real', async () => {
  const env=obtenerHandlerServidor(); const res=env.respuesta();
  await env.fn({query:{resumen:'calendario',desde:'2026-11-01',hasta:'2026-11-30'}},res);
  assert.equal(res.body.total,2);
  assert.equal(res.body.data[0].fecha,'2026-11-15');
  assert.equal(env.consultas.length,1);
  assert.match(env.consultas[0].sql,/GROUP BY co\.fecha_emision::date/);
});

test('nueva facturacion: fechas invalidas, SQL injectado, paginas grandes se rechazan sin consultar DB', async () => {
  const casos=[
    {desde:'2026-02-30',hasta:'2026-03-01'},
    {desde:'2026-11-15',hasta:'2026-11-14'},
    {tipo:"boleta';DROP TABLE pagos;--"},
    {pagina:'-1'}, {limite:'999999'}, {resumen:'eliminar'},
  ];
  for(const query of casos){const env=obtenerHandlerServidor();const res=env.respuesta();await env.fn({query},res);assert.equal(res.code,400);assert.equal(env.consultas.length,0);}
});

function entornoNavegador() {
  const codigo=leer('Frontend/js/facturacion.js');
  const elementos=new Map(), eventos=new Map(), peticiones=[];
  function el(id) {
    if(!elementos.has(id)){
      const callbacks=new Map();
      elementos.set(id, {
        id, value:'',textContent:'',innerHTML:'',disabled:false,dataset:{},
        addEventListener:(nombre,fn)=>callbacks.set(nombre,fn),
        emit:(nombre,payload={})=>callbacks.get(nombre)?.(payload),
        setAttribute() {},
      });
    }
    return elementos.get(id);
  }
  const document = {
    getElementById:el,
    addEventListener:(nombre,fn)=>eventos.set(nombre,fn),
    querySelectorAll:()=>[],
  };
  const window={MENUGO_PERSONAL_BLOQUEADO:false,MENUGO_API:'https://demo.invalid/api',
    MenuGoHistorialTicket:{idPagoValido:v=>/^\d+$/.test(String(v))?Number(v):null,enlazarContenedor(){}}};
  const fetch=async(url,options)=>{
    peticiones.push({url,options});
    const params=new URL(url).searchParams;
    const resumen=params.get('resumen')==='calendario';
    return {ok:true,json:async()=>resumen
      ? {ok:true,data:[{fecha:'2026-11-15',cantidad:2,total:'50.00'}]}
      : {ok:true,data:[{id_pago:44,id_comprobante:18,tipo_comprobante:'boleta',monto:'50.00',fecha_emision:'2026-11-15T12:30:00Z',metodo_pago:'Yape'}],total:1,monto_total:'50.00',limite:24,pagina:1}};
  };
  const ctx={window,document,URL,URLSearchParams,fetch,headersAutenticadosPersonal:()=>({Authorization:'Bearer SOLO-EN-HEADER'})};
  vm.runInNewContext(codigo,ctx,{filename:'facturacion.js'});
  return {el,eventos,peticiones,ctx};
}
const resolver=()=>new Promise(r=>setImmediate(r));

test('nueva facturacion: HTML contiene calendario navegable, logo y filtros rapidos', () => {
  const html=leer('Frontend/Cajero/facturacion.html');
  for(const id of ['fact-desde','fact-hasta','calendario-grid','cal-anterior','cal-siguiente','fact-pagina-anterior','fact-pagina-siguiente'])assert.ok(html.includes(`id="${id}"`),id);
  for(const periodo of ['hoy','semana','mes','tres-meses'])assert.ok(html.includes(`data-periodo="${periodo}"`),periodo);
  assert.match(html,/\.\.\/img\/Log\.png/);
  assert.match(html,/SUNAT/);
});

test('nueva facturacion: semana, mes y tres meses producen rangos correctos', () => {
  const env=entornoNavegador();
  const evalua=s=>vm.runInNewContext(s,env.ctx);
  assert.equal(evalua("fechasPeriodoFact('semana','2026-11-15').desde"),'2026-11-09');
  assert.equal(evalua("fechasPeriodoFact('mes','2026-11-15').desde"),'2026-11-01');
  assert.equal(evalua("fechasPeriodoFact('tres-meses','2026-11-15').desde"),'2026-08-15');
  assert.equal(evalua("fechaValidaFact('2026-02-30')"),false);
  assert.equal(evalua("fechaValidaFact('2024-02-29')"),true);
});

test('nueva facturacion: lista y calendario consultan API con GET, sin vista previa ni POST', async () => {
  const env=entornoNavegador();
  env.eventos.get('DOMContentLoaded')(); await resolver(); await resolver();
  assert.equal(env.peticiones.length,2);
  assert.ok(env.peticiones.every(x=>x.options.method==='GET'));
  assert.ok(env.peticiones.every(x=>x.options.headers.Authorization==='Bearer SOLO-EN-HEADER'));
  assert.match(env.peticiones[0].url,/\/cajero\/comprobantes\?/);
  assert.match(env.peticiones[1].url,/resumen=calendario/);
  const html=env.el('lista-comprobantes').innerHTML;
  assert.match(html,/Reimprimir comprobante/);
  assert.doesNotMatch(html,/Ver ticket/);
  assert.match(html,/data-pago="44"/);
  assert.match(env.el('calendario-grid').innerHTML,/data-fecha=/);
  assert.equal(env.el('fact-total').textContent,'1');
});
